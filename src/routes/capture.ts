import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { ingestTreePhoto, type PhotoSource } from './photos';

// Two auth models on purpose, matching irrigation.ts's split:
// - Browser-facing endpoints (request a capture, check its status) stay
//   under /api/v1/trees/* and rely on the *default* Cloudflare Access
//   protection every other browser-facing route already has -- no new
//   bypass needed for these.
// - Device-facing endpoints (poll for work, upload the result) live under
//   /api/v1/capture/* and need their own Access "Bypass" policy (like
//   /privacy, /terms, and the Twilio webhook already have), since the
//   local capture script can't do interactive SSO. Auth for these is the
//   X-Camera-Key header instead, checked in the Worker itself.
function checkCameraAuth(request: Request, env: Env): boolean {
  const key = request.headers.get('X-Camera-Key');
  return !!key && !!env.CAMERA_DEVICE_KEY && key === env.CAMERA_DEVICE_KEY;
}

function unauthorized(headers?: HeadersInit): Response {
  return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers });
}

// --- Device-facing: polled by the local capture script ---

async function handleGetCommand(request: Request, env: Env): Promise<Response> {
  if (!checkCameraAuth(request, env)) return unauthorized();

  const row = await env.DB.prepare(
    `SELECT id, tree_id, requested_at FROM capture_requests WHERE status = 'pending' ORDER BY requested_at ASC LIMIT 1`
  ).first<{ id: number; tree_id: string; requested_at: string }>();

  if (!row) return Response.json({ action: 'none' });

  return Response.json({ action: 'capture', request_id: String(row.id), tree_id: row.tree_id, requested_at: row.requested_at });
}

async function handleCaptureUpload(request: Request, env: Env, treeId: string): Promise<Response> {
  if (!checkCameraAuth(request, env)) return unauthorized();

  const url = new URL(request.url);
  const sourceParam = url.searchParams.get('source');
  const source: PhotoSource = sourceParam === 'scheduled' ? 'scheduled' : 'manual';
  const requestIdParam = url.searchParams.get('request_id');
  const requestId = requestIdParam ? Number(requestIdParam) : null;

  const contentType = request.headers.get('content-type') || '';
  const bytes = await request.arrayBuffer();
  const result = await ingestTreePhoto(env, treeId, bytes, contentType, source);

  if (requestId) {
    if (result.ok) {
      await env.DB.prepare(`UPDATE capture_requests SET status = 'completed', completed_at = datetime('now'), analysis_id = ? WHERE id = ?`)
        .bind(result.analysisId, requestId)
        .run();
    } else {
      await env.DB.prepare(`UPDATE capture_requests SET status = 'failed', completed_at = datetime('now'), error = ? WHERE id = ?`)
        .bind(result.error, requestId)
        .run();
    }
  }

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error, photo_r2_key: result.photoKey }, { status: result.status });
  }

  return Response.json({ ok: true, analysis_id: result.analysisId, photo_r2_key: result.photoKey, status: result.status, summary: result.summary });
}

async function handleReportFailure(request: Request, env: Env, requestId: number): Promise<Response> {
  if (!checkCameraAuth(request, env)) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { error?: string };
  await env.DB.prepare(`UPDATE capture_requests SET status = 'failed', completed_at = datetime('now'), error = ? WHERE id = ?`)
    .bind(body.error ?? 'capture failed', requestId)
    .run();
  return Response.json({ ok: true });
}

// --- Browser-facing: the app's "Capture now" button ---

async function handleCreateRequest(env: Env, treeId: string, headers: HeadersInit): Promise<Response> {
  const tree = await env.DB.prepare('SELECT id FROM trees WHERE id = ?').bind(treeId).first();
  if (!tree) return Response.json({ ok: false, error: `unknown tree_id ${treeId}` }, { status: 404, headers });

  // Avoid piling up duplicate pending requests if someone double-clicks or
  // a previous request never got picked up (script offline, etc.).
  const existing = await env.DB.prepare(`SELECT id FROM capture_requests WHERE tree_id = ? AND status = 'pending'`).bind(treeId).first<{ id: number }>();
  if (existing) return Response.json({ ok: true, request_id: String(existing.id), already_pending: true }, { headers });

  const result = await env.DB.prepare(`INSERT INTO capture_requests (tree_id) VALUES (?)`).bind(treeId).run();
  return Response.json({ ok: true, request_id: String(result.meta.last_row_id) }, { headers });
}

type CaptureRequestRow = {
  id: number;
  status: 'pending' | 'completed' | 'failed';
  requested_at: string;
  completed_at: string | null;
  analysis_id: number | null;
  error: string | null;
};

async function handleLatestRequest(env: Env, treeId: string, headers: HeadersInit): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, status, requested_at, completed_at, analysis_id, error FROM capture_requests WHERE tree_id = ? ORDER BY requested_at DESC LIMIT 1`
  )
    .bind(treeId)
    .first<CaptureRequestRow>();

  if (!row) return Response.json({ request: null }, { headers });

  return Response.json(
    {
      request: {
        id: String(row.id),
        status: row.status,
        requested_at: row.requested_at,
        completed_at: row.completed_at,
        analysis_id: row.analysis_id,
        error: row.error,
      },
    },
    { headers }
  );
}

export async function handleCaptureRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  // Device-facing, under /api/v1/capture/*.
  if (pathname === '/api/v1/capture/command' && request.method === 'GET') {
    return handleGetCommand(request, env);
  }
  const uploadMatch = pathname.match(/^\/api\/v1\/capture\/upload\/([^/]+)$/);
  if (uploadMatch && request.method === 'POST') {
    return handleCaptureUpload(request, env, uploadMatch[1]);
  }
  const failMatch = pathname.match(/^\/api\/v1\/capture\/fail\/(\d+)$/);
  if (failMatch && request.method === 'POST') {
    return handleReportFailure(request, env, Number(failMatch[1]));
  }

  // Browser-facing, under /api/v1/trees/*/capture-request -- same Access
  // protection as every other /api/v1/trees/* route, no bypass needed.
  const requestMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/capture-request$/);
  const latestMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/capture-request\/latest$/);
  if (requestMatch || latestMatch) {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (requestMatch && request.method === 'POST') return handleCreateRequest(env, requestMatch[1], headers);
    if (latestMatch && request.method === 'GET') return handleLatestRequest(env, latestMatch[1], headers);
  }

  return null;
}
