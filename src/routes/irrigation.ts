import type { Env } from '../env';

type TriggerSource = 'manual' | 'scheduled' | 'sensor' | 'ai';
type AbortedReason = 'no_flow_detected' | 'max_runtime_cutoff' | 'wifi_lost' | 'manual_stop' | null;

function unauthorized(): Response {
  return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

function checkDeviceAuth(request: Request, env: Env): boolean {
  const key = request.headers.get('X-Device-Key');
  return !!key && key === env.IRRIGATION_DEVICE_KEY;
}

async function handleGetCommand(request: Request, env: Env): Promise<Response> {
  if (!checkDeviceAuth(request, env)) return unauthorized();

  const { results } = await env.DB.prepare(
    `SELECT ie.id, ie.tree_id, ie.requested_duration_sec, ie.ts, iz.valve_channel
     FROM irrigation_events ie
     JOIN irrigation_zones iz ON iz.tree_id = ie.tree_id
     WHERE ie.flow_confirmed IS NULL AND ie.aborted_reason IS NULL
     ORDER BY ie.ts ASC
     LIMIT 1`
  ).all();

  const row = results[0] as
    | { id: number; tree_id: string; requested_duration_sec: number; ts: string; valve_channel: number }
    | undefined;

  if (!row) {
    return Response.json({ action: 'none' });
  }

  return Response.json({
    action: 'water',
    command_id: String(row.id),
    tree_id: row.tree_id,
    valve_channel: row.valve_channel,
    duration_sec: row.requested_duration_sec,
    issued_at: row.ts,
  });
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
  const event = await env.DB.prepare('SELECT tree_id FROM irrigation_events WHERE id = ?').bind(eventId).first<{ tree_id: string }>();
  if (!event) {
    return Response.json({ ok: false, error: 'unknown command_id' }, { status: 404 });
  }

  await env.DB.batch([
    env.DB.prepare('UPDATE irrigation_events SET actual_duration_sec = ?, flow_confirmed = ?, aborted_reason = ? WHERE id = ?').bind(
      body.actual_duration_sec ?? null,
      body.flow_confirmed === undefined ? null : body.flow_confirmed ? 1 : 0,
      body.aborted_reason ?? null,
      eventId
    ),
    env.DB.prepare(
      `UPDATE irrigation_zones SET last_watered_at = datetime('now'), last_duration_sec = ?, updated_at = datetime('now') WHERE tree_id = ?`
    ).bind(body.actual_duration_sec ?? null, event.tree_id),
  ]);

  // TODO(Phase 2): if aborted_reason is set and flow_confirmed is false, raise an
  // `urgent` alert per SPEC.md 1.5 — alerting pipeline doesn't exist yet.

  return Response.json({ ok: true });
}

// TODO: unauthenticated — fine while the whole API has no user-auth layer (Phase 0,
// single user), but this actuates physical hardware. Gate behind app-level auth
// before this is reachable by anyone other than you.
async function handleWaterRequest(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { tree_id?: string; duration_sec?: number; trigger_source?: TriggerSource };

  if (!body.tree_id || !body.duration_sec) {
    return Response.json({ ok: false, error: 'tree_id and duration_sec required' }, { status: 400 });
  }

  const zone = await env.DB.prepare('SELECT tree_id FROM irrigation_zones WHERE tree_id = ?').bind(body.tree_id).first();
  if (!zone) {
    return Response.json({ ok: false, error: `no irrigation_zone configured for tree_id ${body.tree_id}` }, { status: 404 });
  }

  const result = await env.DB.prepare(
    `INSERT INTO irrigation_events (tree_id, trigger_source, requested_duration_sec) VALUES (?, ?, ?)`
  )
    .bind(body.tree_id, body.trigger_source ?? 'manual', body.duration_sec)
    .run();

  return Response.json({ command_id: String(result.meta.last_row_id), queued: true });
}

export async function handleIrrigationRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname === '/api/v1/irrigation/command' && request.method === 'GET') {
    return handleGetCommand(request, env);
  }
  if (pathname === '/api/v1/irrigation/confirm' && request.method === 'POST') {
    return handleConfirm(request, env);
  }
  if (pathname === '/api/v1/irrigation/water' && request.method === 'POST') {
    return handleWaterRequest(request, env);
  }
  return null;
}
