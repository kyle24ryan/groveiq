import type { Env } from '../env';
import { corsHeaders } from './conditions';

const KEYS = ['collection_name', 'owner_name', 'location', 'hardiness_zone', 'camera_enabled', 'irrigation_enabled'] as const;
type SettingsKey = (typeof KEYS)[number];

// Shared by capture.ts and irrigation.ts to gate their browser-facing
// create endpoints and device-facing poll queues on the Settings toggles.
// Fails open (enabled) if the row is missing -- these keys are always
// seeded by migration 0017, so a missing row means the migration hasn't
// run yet, not that someone deliberately disabled the feature; failing
// closed in that case would silently break capture/irrigation on any
// environment that hasn't caught up, which is worse than the reverse.
export async function isFeatureEnabled(env: Env, key: 'camera_enabled' | 'irrigation_enabled'): Promise<boolean> {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row ? row.value === 'true' : true;
}

async function handleGet(env: Env, headers: HeadersInit): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT key, value FROM app_settings').all<{ key: string; value: string }>();
  const settings = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return Response.json({ settings }, { headers });
}

async function handlePut(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body = (await request.json()) as Partial<Record<SettingsKey, string>>;

  const updates = KEYS.filter((k) => k in body);
  if (updates.length === 0) {
    return Response.json({ error: 'no_valid_keys_provided' }, { status: 400, headers });
  }

  for (const key of updates) {
    await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(key, body[key])
      .run();
  }

  return handleGet(env, headers);
}

export async function handleSettingsRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname !== '/api/v1/settings') return null;

  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method === 'GET') return handleGet(env, headers);
  if (request.method === 'PUT') return handlePut(request, env, headers);
  return null;
}
