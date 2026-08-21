import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { raiseIrrigationFaultAlert } from '../alerts';

type TriggerSource = 'manual' | 'scheduled' | 'sensor' | 'ai';
type AbortedReason = 'no_flow_detected' | 'max_runtime_cutoff' | 'wifi_lost' | 'manual_stop' | 'device_unresponsive' | 'configuration_fault' | null;

function unauthorized(headers?: HeadersInit): Response {
  return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers });
}

// Two auth models, matching capture.ts's split:
// - Browser-facing endpoints (request watering, check its status) live
//   under /api/v1/trees/* and rely on the *default* Cloudflare Access
//   protection every other browser-facing route already has.
// - Device-facing endpoints (poll for work, confirm a result) stay under
//   /api/v1/irrigation/* and need their own Access Service Token policy
//   (same model as /api/v1/capture/*, documented in
//   scripts/camera-capture/README.md -- that doc explicitly flags this
//   project as never having set up the equivalent for irrigation yet).
//   Auth for these is the X-Device-Key header, checked in the Worker
//   itself, as a second layer under the Access policy.
function checkDeviceAuth(request: Request, env: Env): boolean {
  const key = request.headers.get('X-Device-Key');
  return !!key && !!env.IRRIGATION_DEVICE_KEY && key === env.IRRIGATION_DEVICE_KEY;
}

// --- Device-facing: polled by the ESP32 controller ---

type CommandRow = {
  id: number;
  tree_id: string;
  zone_id: string;
  requested_duration_sec: number;
  ts: string;
  valve_channel: number;
};

async function handleGetCommand(request: Request, env: Env): Promise<Response> {
  if (!checkDeviceAuth(request, env)) return unauthorized();

  const candidate = await env.DB.prepare(
    `SELECT ie.id, ie.tree_id, ie.zone_id, ie.requested_duration_sec, ie.ts, iz.valve_channel
     FROM irrigation_events ie
     JOIN irrigation_zones iz ON iz.zone_id = ie.zone_id
     WHERE ie.status = 'pending'
     ORDER BY ie.ts ASC
     LIMIT 1`
  ).first<CommandRow>();

  if (!candidate) return Response.json({ action: 'none' });

  // Atomic claim -- only wins if the row is still 'pending'. Closes a race
  // a plain SELECT-then-act poll can't: two overlapping polls (or a retry)
  // would otherwise both be handed the same command_id.
  const claim = await env.DB.prepare(`UPDATE irrigation_events SET status = 'claimed', claimed_at = datetime('now') WHERE id = ? AND status = 'pending'`)
    .bind(candidate.id)
    .run();

  if (claim.meta.changes === 0) {
    // Someone else claimed it between the SELECT and the UPDATE above --
    // treat as nothing available this poll rather than retrying in a
    // loop; the device just polls again in kPollIntervalMs.
    return Response.json({ action: 'none' });
  }

  return Response.json({
    action: 'water',
    command_id: String(candidate.id),
    tree_id: candidate.tree_id,
    zone_id: candidate.zone_id,
    valve_channel: candidate.valve_channel,
    duration_sec: candidate.requested_duration_sec,
    issued_at: candidate.ts,
  });
}

function describeAbortReason(reason: AbortedReason): string {
  switch (reason) {
    case 'no_flow_detected':
      return 'no flow detected';
    case 'max_runtime_cutoff':
      return 'hit its max-runtime cutoff';
    case 'wifi_lost':
      return 'lost WiFi mid-cycle';
    case 'manual_stop':
      return 'was stopped manually';
    case 'configuration_fault':
      return 'refused -- zone pin configuration invalid or another zone already active';
    default:
      return 'aborted';
  }
}

// Shared by /confirm (an async command the device polled for) and /manual
// (a command the device initiated itself via the physical button, reported
// after the fact) -- same terminal-state write, zone update, and fault
// alert either way.
async function resolveWatering(
  env: Env,
  treeId: string,
  zoneId: string | null,
  actualDurationSec: number | null | undefined,
  abortedReason: AbortedReason | undefined
): Promise<void> {
  // A configuration_fault means the valve was never actually pulsed --
  // recording it as a "last watered" event would misleadingly suggest an
  // attempt happened.
  if (zoneId && abortedReason !== 'configuration_fault') {
    await env.DB.prepare(
      `UPDATE irrigation_zones SET last_watered_at = datetime('now'), last_duration_sec = ?, updated_at = datetime('now') WHERE zone_id = ?`
    )
      .bind(actualDurationSec ?? null, zoneId)
      .run();
  }
  if (abortedReason === 'no_flow_detected' || abortedReason === 'max_runtime_cutoff' || abortedReason === 'configuration_fault') {
    await raiseIrrigationFaultAlert(env, `Watering ${treeId} aborted -- ${describeAbortReason(abortedReason)}.`);
  }
}

async function handleConfirm(request: Request, env: Env): Promise<Response> {
  if (!checkDeviceAuth(request, env)) return unauthorized();

  const body = (await request.json()) as {
    command_id?: string;
    actual_duration_sec?: number;
    flow_confirmed?: boolean;
    aborted_reason?: AbortedReason;
  };

  if (!body.command_id) {
    return Response.json({ ok: false, error: 'command_id required' }, { status: 400 });
  }

  const eventId = Number(body.command_id);
  const event = await env.DB.prepare('SELECT tree_id, zone_id FROM irrigation_events WHERE id = ?').bind(eventId).first<{ tree_id: string; zone_id: string | null }>();
  if (!event) {
    return Response.json({ ok: false, error: 'unknown command_id' }, { status: 404 });
  }

  const status = body.aborted_reason ? 'aborted' : 'completed';
  await env.DB.prepare('UPDATE irrigation_events SET actual_duration_sec = ?, flow_confirmed = ?, aborted_reason = ?, status = ? WHERE id = ?')
    .bind(
      body.actual_duration_sec ?? null,
      body.flow_confirmed === undefined ? null : body.flow_confirmed ? 1 : 0,
      body.aborted_reason ?? null,
      status,
      eventId
    )
    .run();

  await resolveWatering(env, event.tree_id, event.zone_id, body.actual_duration_sec, body.aborted_reason);

  return Response.json({ ok: true });
}

// Device-facing, for the physical manual button: unlike /command (the
// device asks the Worker "is there anything to do"), a button press is
// locally-initiated -- the physical button *is* local authority, so the
// device just runs the watering immediately and reports what happened
// afterward, rather than pretending it went through the async
// request/poll queue it never actually used.
async function handleManualReport(request: Request, env: Env): Promise<Response> {
  if (!checkDeviceAuth(request, env)) return unauthorized();

  const body = (await request.json()) as {
    zone_id?: string;
    requested_duration_sec?: number;
    actual_duration_sec?: number;
    flow_confirmed?: boolean;
    aborted_reason?: AbortedReason;
  };

  if (!body.zone_id || !body.requested_duration_sec) {
    return Response.json({ ok: false, error: 'zone_id and requested_duration_sec required' }, { status: 400 });
  }

  const zone = await env.DB.prepare('SELECT tree_id FROM irrigation_zones WHERE zone_id = ?').bind(body.zone_id).first<{ tree_id: string }>();
  if (!zone) {
    return Response.json({ ok: false, error: `unknown zone_id ${body.zone_id}` }, { status: 404 });
  }

  const status = body.aborted_reason ? 'aborted' : 'completed';
  await env.DB.prepare(
    `INSERT INTO irrigation_events (tree_id, zone_id, trigger_source, requested_duration_sec, actual_duration_sec, flow_confirmed, aborted_reason, status, claimed_at)
     VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      zone.tree_id,
      body.zone_id,
      body.requested_duration_sec,
      body.actual_duration_sec ?? null,
      body.flow_confirmed === undefined ? null : body.flow_confirmed ? 1 : 0,
      body.aborted_reason ?? null,
      status
    )
    .run();

  await resolveWatering(env, zone.tree_id, body.zone_id, body.actual_duration_sec, body.aborted_reason);

  return Response.json({ ok: true });
}

// --- Browser-facing: the app's "Water now" button ---

async function handleCreateWaterRequest(env: Env, treeId: string, headers: HeadersInit, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { duration_sec?: number; trigger_source?: TriggerSource };
  const durationSec = body.duration_sec;
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) {
    return Response.json({ ok: false, error: 'duration_sec must be a positive number' }, { status: 400, headers });
  }

  const zone = await env.DB.prepare('SELECT zone_id FROM irrigation_zones WHERE tree_id = ?').bind(treeId).first<{ zone_id: string }>();
  if (!zone) {
    return Response.json({ ok: false, error: `no irrigation zone configured for tree_id ${treeId}` }, { status: 404, headers });
  }

  // Avoid piling up duplicate pending requests if someone double-clicks, or
  // a previous request never got picked up (device offline).
  const existing = await env.DB.prepare(`SELECT id FROM irrigation_events WHERE zone_id = ? AND status IN ('pending','claimed')`)
    .bind(zone.zone_id)
    .first<{ id: number }>();
  if (existing) {
    return Response.json({ ok: true, request_id: String(existing.id), already_pending: true }, { headers });
  }

  const result = await env.DB.prepare(`INSERT INTO irrigation_events (tree_id, zone_id, trigger_source, requested_duration_sec) VALUES (?, ?, ?, ?)`)
    .bind(treeId, zone.zone_id, body.trigger_source ?? 'manual', durationSec)
    .run();

  return Response.json({ ok: true, request_id: String(result.meta.last_row_id) }, { headers });
}

type WaterRequestRow = {
  id: number;
  status: 'pending' | 'claimed' | 'completed' | 'aborted';
  ts: string;
  requested_duration_sec: number;
  actual_duration_sec: number | null;
  flow_confirmed: number | null;
  aborted_reason: string | null;
};

async function handleLatestWaterRequest(env: Env, treeId: string, headers: HeadersInit): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, status, ts, requested_duration_sec, actual_duration_sec, flow_confirmed, aborted_reason
     FROM irrigation_events WHERE tree_id = ? ORDER BY ts DESC LIMIT 1`
  )
    .bind(treeId)
    .first<WaterRequestRow>();

  if (!row) return Response.json({ request: null }, { headers });

  return Response.json(
    {
      request: {
        id: String(row.id),
        status: row.status,
        ts: row.ts,
        requested_duration_sec: row.requested_duration_sec,
        actual_duration_sec: row.actual_duration_sec,
        flow_confirmed: row.flow_confirmed === null ? null : !!row.flow_confirmed,
        aborted_reason: row.aborted_reason,
      },
    },
    { headers }
  );
}

type ZoneRow = { zone_id: string; last_watered_at: string | null; last_duration_sec: number | null };
type EventHistoryRow = {
  id: number;
  ts: string;
  status: 'pending' | 'claimed' | 'completed' | 'aborted';
  trigger_source: TriggerSource;
  requested_duration_sec: number;
  actual_duration_sec: number | null;
  flow_confirmed: number | null;
  aborted_reason: string | null;
};

// Zone config + recent event history for a tree -- feeds the frontend's
// shared useTreeInsights hook (last-watered, recent-events list, Timeline
// markers) so those screens can't disagree about "when was this last
// watered," same reasoning the hook already documents for soil-reading
// data.
async function handleZoneInfo(env: Env, treeId: string, headers: HeadersInit): Promise<Response> {
  const zone = await env.DB.prepare('SELECT zone_id, last_watered_at, last_duration_sec FROM irrigation_zones WHERE tree_id = ?')
    .bind(treeId)
    .first<ZoneRow>();

  if (!zone) return Response.json({ zone: null, events: [] }, { headers });

  const { results: events } = await env.DB.prepare(
    `SELECT id, ts, status, trigger_source, requested_duration_sec, actual_duration_sec, flow_confirmed, aborted_reason
     FROM irrigation_events WHERE zone_id = ? AND status IN ('completed','aborted') ORDER BY ts DESC LIMIT 20`
  )
    .bind(zone.zone_id)
    .all<EventHistoryRow>();

  return Response.json(
    {
      zone: { zone_id: zone.zone_id, last_watered_at: zone.last_watered_at, last_duration_sec: zone.last_duration_sec },
      events: events.map((e) => ({
        id: String(e.id),
        ts: e.ts,
        status: e.status,
        trigger_source: e.trigger_source,
        requested_duration_sec: e.requested_duration_sec,
        actual_duration_sec: e.actual_duration_sec,
        flow_confirmed: e.flow_confirmed === null ? null : !!e.flow_confirmed,
        aborted_reason: e.aborted_reason,
      })),
    },
    { headers }
  );
}

export async function handleIrrigationRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  // Device-facing, under /api/v1/irrigation/*.
  if (pathname === '/api/v1/irrigation/command' && request.method === 'GET') {
    return handleGetCommand(request, env);
  }
  if (pathname === '/api/v1/irrigation/confirm' && request.method === 'POST') {
    return handleConfirm(request, env);
  }
  if (pathname === '/api/v1/irrigation/manual' && request.method === 'POST') {
    return handleManualReport(request, env);
  }

  // Browser-facing, under /api/v1/trees/*/water-request -- same Access
  // protection as every other /api/v1/trees/* route, no bypass needed.
  const requestMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/water-request$/);
  const latestMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/water-request\/latest$/);
  if (requestMatch || latestMatch) {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (requestMatch && request.method === 'POST') return handleCreateWaterRequest(env, requestMatch[1], headers, request);
    if (latestMatch && request.method === 'GET') return handleLatestWaterRequest(env, latestMatch[1], headers);
  }

  const zoneMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/irrigation$/);
  if (zoneMatch && request.method === 'GET') {
    const headers = corsHeaders(request);
    return handleZoneInfo(env, zoneMatch[1], headers);
  }
  if (zoneMatch && request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(request) });
  }

  return null;
}
