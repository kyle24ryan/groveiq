import type { Env } from '../env';
import { corsHeaders } from './conditions';

type TreeRow = {
  id: string;
  name: string;
  nickname: string | null;
  species: string;
  pot_size_liters: number | null;
  origin_notes: string | null;
  origin_type: string | null;
  acquired_date: string | null;
  estimated_age_years_low: number | null;
  estimated_age_years_high: number | null;
  development_stage: string | null;
  notes: string | null;
  soil_moisture_threshold_low: number | null;
  soil_moisture_threshold_high: number | null;
  ec_threshold_high: number | null;
  dormancy_soil_temp_c: number | null;
  created_at: string;
};

// Fields a user can actually edit -- id/species/created_at are fixed.
const EDITABLE_FIELDS = [
  'name',
  'nickname',
  'pot_size_liters',
  'origin_notes',
  'origin_type',
  'acquired_date',
  'estimated_age_years_low',
  'estimated_age_years_high',
  'development_stage',
  'notes',
  'soil_moisture_threshold_low',
  'soil_moisture_threshold_high',
  'ec_threshold_high',
  'dormancy_soil_temp_c',
] as const;

type SoilReadingRow = {
  id: number;
  tree_id: string;
  ts: string;
  soil_moisture_pct: number | null;
  soil_temp_c: number | null;
  soil_ec: number | null;
};

async function handleSoilReadings(env: Env, id: string, headers: HeadersInit, hours: number): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT * FROM soil_readings WHERE tree_id = ? AND ts >= datetime('now', ?) ORDER BY ts ASC`)
    .bind(id, `-${hours} hours`)
    .all<SoilReadingRow>();
  return Response.json({ readings: results }, { headers });
}

type DailyReadingRow = {
  date: string;
  soil_moisture_avg: number | null;
  soil_moisture_min: number | null;
  soil_moisture_max: number | null;
  soil_temp_avg: number | null;
  soil_ec_avg: number | null;
  outdoor_temp_avg: number | null;
  outdoor_temp_min: number | null;
  humidity_avg: number | null;
  wind_max: number | null;
  rain_total: number | null;
  black_globe_max: number | null;
  pm25_avg: number | null;
};

async function handleDailyReadings(env: Env, id: string, headers: HeadersInit, days: number): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT * FROM daily_readings WHERE tree_id = ? AND date >= date('now', ?) ORDER BY date ASC`)
    .bind(id, `-${days} days`)
    .all<DailyReadingRow>();
  return Response.json({ readings: results }, { headers });
}

async function handleListTrees(env: Env, headers: HeadersInit): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT * FROM trees ORDER BY name').all<TreeRow>();
  return Response.json({ trees: results }, { headers });
}

async function handleGetTree(env: Env, id: string, headers: HeadersInit): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM trees WHERE id = ?').bind(id).first<TreeRow>();
  if (!row) return Response.json({ error: 'not_found' }, { status: 404, headers });
  return Response.json({ tree: row }, { headers });
}

async function handlePatchTree(request: Request, env: Env, id: string, headers: HeadersInit): Promise<Response> {
  const body = (await request.json()) as Partial<Record<(typeof EDITABLE_FIELDS)[number], unknown>>;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      setClauses.push(`${field} = ?`);
      values.push(body[field]);
    }
  }
  if (setClauses.length === 0) {
    return Response.json({ error: 'no_editable_fields_provided' }, { status: 400, headers });
  }

  values.push(id);
  const result = await env.DB.prepare(`UPDATE trees SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) {
    return Response.json({ error: 'not_found' }, { status: 404, headers });
  }

  return handleGetTree(env, id, headers);
}

export async function handleTreesRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const listMatch = pathname === '/api/v1/trees';
  const singleMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)$/);
  const soilMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/soil-readings$/);
  const dailyMatch = pathname.match(/^\/api\/v1\/trees\/([^/]+)\/daily-readings$/);
  if (!listMatch && !singleMatch && !soilMatch && !dailyMatch) return null;

  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { headers });

  if (listMatch && request.method === 'GET') {
    return handleListTrees(env, headers);
  }
  if (soilMatch && request.method === 'GET') {
    const url = new URL(request.url);
    const hours = Number(url.searchParams.get('hours')) || 720; // 30 days default
    return handleSoilReadings(env, soilMatch[1], headers, hours);
  }
  if (dailyMatch && request.method === 'GET') {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days')) || 30;
    return handleDailyReadings(env, dailyMatch[1], headers, days);
  }
  if (singleMatch && request.method === 'GET') {
    return handleGetTree(env, singleMatch[1], headers);
  }
  if (singleMatch && request.method === 'PATCH') {
    return handlePatchTree(request, env, singleMatch[1], headers);
  }
  return null;
}
