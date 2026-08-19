import type { Env } from '../env';

const ALLOWED_ORIGINS = new Set(['https://grove-iq.com', 'http://localhost:5173']);

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://grove-iq.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    // Credentials required so the browser sends the Cloudflare Access
    // session cookie on cross-origin fetch() calls from grove-iq.com to
    // api.grove-iq.com — can't use a wildcard origin together with this,
    // which is why ALLOWED_ORIGINS is an explicit allowlist above.
    'Access-Control-Allow-Credentials': 'true',
    // POST is real: photos.ts's upload endpoint sends Content-Type:
    // image/jpeg, which isn't a CORS "simple request" and triggers a
    // preflight OPTIONS this needs to pass.
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Key',
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

type DailyConditionsRow = {
  date: string;
  outdoor_temp_avg: number | null;
  outdoor_temp_min: number | null;
  humidity_avg: number | null;
  wind_max: number | null;
  rain_total: number | null;
  black_globe_max: number | null;
  pm25_avg: number | null;
};

// Week/month/year chart ranges use the daily_readings rollup rather than
// raw conditions_readings -- one row per day instead of ~288 (5-min
// cadence), and it already exists with no separate retention concern.
// daily_readings is keyed by tree_id but conditions are location-wide and
// dailyRollup.ts writes the identical conditionsAgg into every tree's row
// for a given date, so MAX() across trees is just a safe way to read "the"
// value per date without depending on any particular tree_id existing.
async function handleDailyHistory(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const url = new URL(request.url);
  const days = Math.max(1, Number(url.searchParams.get('days')) || 30);
  const { results } = await env.DB.prepare(
    `SELECT date,
            MAX(outdoor_temp_avg) as outdoor_temp_avg,
            MAX(outdoor_temp_min) as outdoor_temp_min,
            MAX(humidity_avg) as humidity_avg,
            MAX(wind_max) as wind_max,
            MAX(rain_total) as rain_total,
            MAX(black_globe_max) as black_globe_max,
            MAX(pm25_avg) as pm25_avg
     FROM daily_readings
     WHERE date >= date('now', ?)
     GROUP BY date
     ORDER BY date ASC`
  )
    .bind(`-${days} days`)
    .all<DailyConditionsRow>();
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
  if (pathname === '/api/v1/conditions/daily-history' && request.method === 'GET') {
    return handleDailyHistory(request, env, headers);
  }
  return null;
}
