import type { Env } from '../env';

const ALLOWED_ORIGINS = new Set(['https://grove-iq.com', 'http://localhost:5173']);

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://grove-iq.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
}

type ConditionsRow = {
  ts: string;
  outdoor_temp_c: number | null;
  humidity_pct: number | null;
  wind_mph: number | null;
  wind_dir_deg: number | null;
  rain_in: number | null;
  pressure_hpa: number | null;
  solar_wm2: number | null;
  uvi: number | null;
  black_globe_temp_c: number | null;
  wbgt_c: number | null;
  pm25: number | null;
  pm25_aqi: number | null;
  pm25_aqi_24h: number | null;
  battery_sensor_array_code: number | null;
  battery_pm25_ch1_code: number | null;
  battery_bgt_voltage_v: number | null;
};

async function handleLatest(env: Env, headers: HeadersInit): Promise<Response> {
  const row = await env.DB.prepare(`SELECT * FROM conditions_readings ORDER BY ts DESC LIMIT 1`).first<ConditionsRow>();
  return Response.json({ reading: row ?? null }, { headers });
}

async function handleHistory(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const url = new URL(request.url);
  const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours')) || 24));
  const { results } = await env.DB.prepare(
    `SELECT * FROM conditions_readings WHERE ts >= datetime('now', ?) ORDER BY ts ASC`
  )
    .bind(`-${hours} hours`)
    .all<ConditionsRow>();
  return Response.json({ readings: results }, { headers });
}

export async function handleConditionsRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS' && pathname.startsWith('/api/v1/conditions/')) {
    return new Response(null, { headers });
  }
  if (pathname === '/api/v1/conditions/latest' && request.method === 'GET') {
    return handleLatest(env, headers);
  }
  if (pathname === '/api/v1/conditions/history' && request.method === 'GET') {
    return handleHistory(request, env, headers);
  }
  return null;
}
