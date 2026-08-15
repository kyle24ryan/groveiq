import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { analyzeTreePhoto } from '../claude';

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export type PhotoSource = 'manual' | 'scheduled';

type IngestResult =
  | { ok: true; analysisId: number; photoKey: string; status: string; summary: string | null; detail: string | null }
  | { ok: false; status: number; error: string; photoKey?: string };

// Shared by both photo-ingestion paths: the browser upload in this file
// (Access-gated, always source='manual') and the camera capture route
// (device-key gated, source is whichever the caller passed). Keeping one
// function means the R2 write, vision-analysis call, and analyses insert
// can't drift between the two entry points.
export async function ingestTreePhoto(env: Env, treeId: string, bytes: ArrayBuffer, contentType: string, source: PhotoSource): Promise<IngestResult> {
  if (!ALLOWED_MEDIA_TYPES.has(contentType)) {
    return { ok: false, status: 400, error: `unsupported content-type: ${contentType} (expected image/jpeg, image/png, or image/webp)` };
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return { ok: false, status: 400, error: 'image empty or too large (max 8MB)' };
  }

  const tree = await env.DB.prepare('SELECT id, name, species FROM trees WHERE id = ?')
    .bind(treeId)
    .first<{ id: string; name: string; species: string }>();
  if (!tree) {
    return { ok: false, status: 404, error: `unknown tree_id ${treeId}` };
  }

  const speciesRow = await env.DB.prepare('SELECT ai_notes FROM species_reference WHERE species = ?')
    .bind(tree.species)
    .first<{ ai_notes: string | null }>();

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const key = `photos/${treeId}/${Date.now()}.${ext}`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType } });

  let analysis;
  try {
    analysis = await analyzeTreePhoto(env, {
      imageBase64: arrayBufferToBase64(bytes),
      mediaType: contentType,
      treeName: tree.name,
      species: tree.species,
      speciesNotes: speciesRow?.ai_notes ?? undefined,
    });
  } catch (err) {
    // The photo is already saved even if analysis fails - don't lose the upload.
    return { ok: false, status: 502, error: `vision analysis failed: ${String(err)}`, photoKey: key };
  }

  const result = await env.DB.prepare(
    `INSERT INTO analyses (tree_id, kind, source, status, summary, detail, model, photo_r2_key)
     VALUES (?, 'vision', ?, ?, ?, ?, ?, ?)`
  )
    .bind(treeId, source, analysis.status, analysis.summary, analysis.detail, 'claude-sonnet-5', key)
    .run();

  return { ok: true, analysisId: Number(result.meta.last_row_id), photoKey: key, status: analysis.status, summary: analysis.summary, detail: analysis.detail };
}

async function handleUpload(request: Request, env: Env, treeId: string, headers: HeadersInit): Promise<Response> {
  const contentType = request.headers.get('content-type') || '';
  const bytes = await request.arrayBuffer();
  const result = await ingestTreePhoto(env, treeId, bytes, contentType, 'manual');

  if (!result.ok) {
    return Response.json({ error: result.error, photo_r2_key: result.photoKey }, { status: result.status, headers });
  }

  return Response.json(
    {
      analysis_id: result.analysisId,
      photo_r2_key: result.photoKey,
      photo_url: `/api/v1/photos/${encodeURIComponent(result.photoKey)}`,
      status: result.status,
      summary: result.summary,
      detail: result.detail,
    },
    { headers }
  );
}

async function handleServe(env: Env, key: string): Promise<Response> {
  const object = await env.PHOTOS.get(key);
  if (!object) return new Response('not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');
  return new Response(object.body, { headers });
}

type AnalysisRow = {
  id: number;
  kind: string;
  source: string | null;
  status: string | null;
  summary: string | null;
  detail: string | null;
  model: string | null;
  photo_r2_key: string | null;
  ts: string;
};

// Deletes both sides of a photo analysis: the R2 object and the D1 rows
// referencing it (analyses, plus any capture_requests pointing at it via
// analysis_id -- otherwise they'd be left dangling, the same orphan state
// found and manually cleaned up 2026-08-15 after photos were deleted from
// R2 directly without a matching D1 cleanup).
async function handleDeleteAnalysis(env: Env, treeId: string, analysisId: string, headers: HeadersInit): Promise<Response> {
  const id = Number(analysisId);
  if (!Number.isInteger(id)) {
    return Response.json({ error: 'invalid analysis id' }, { status: 400, headers });
  }

  const row = await env.DB.prepare('SELECT id, photo_r2_key FROM analyses WHERE id = ? AND tree_id = ?')
    .bind(id, treeId)
    .first<{ id: number; photo_r2_key: string | null }>();
  if (!row) {
    return Response.json({ error: 'analysis not found' }, { status: 404, headers });
  }

  if (row.photo_r2_key) {
    await env.PHOTOS.delete(row.photo_r2_key);
  }
  await env.DB.prepare('DELETE FROM capture_requests WHERE analysis_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM analyses WHERE id = ?').bind(id).run();

  return Response.json({ ok: true }, { headers });
}

async function handleListAnalyses(env: Env, treeId: string, headers: HeadersInit): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, kind, source, status, summary, detail, model, photo_r2_key, ts FROM analyses WHERE tree_id = ? ORDER BY ts DESC LIMIT 50`
  )
    .bind(treeId)
    .all<AnalysisRow>();

  const analyses = results.map((row) => ({
    ...row,
    photo_url: row.photo_r2_key ? `/api/v1/photos/${encodeURIComponent(row.photo_r2_key)}` : null,
  }));

  return Response.json({ analyses }, { headers });
}

export async function handlePhotosRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS' && (pathname.startsWith('/api/v1/trees/') || pathname.startsWith('/api/v1/photos/'))) {
    return new Response(null, { headers });
  }

  const uploadMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/photos$/);
  if (uploadMatch && request.method === 'POST') {
    return handleUpload(request, env, uploadMatch[1], headers);
  }

  const analysesMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/analyses$/);
  if (analysesMatch && request.method === 'GET') {
    return handleListAnalyses(env, analysesMatch[1], headers);
  }

  const deleteAnalysisMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/analyses\/([^/]+)$/);
  if (deleteAnalysisMatch && request.method === 'DELETE') {
    return handleDeleteAnalysis(env, deleteAnalysisMatch[1], deleteAnalysisMatch[2], headers);
  }

  const photoMatch = pathname.match(/^\/api\/v1\/photos\/(.+)$/);
  if (photoMatch && request.method === 'GET') {
    return handleServe(env, decodeURIComponent(photoMatch[1]));
  }

  return null;
}
