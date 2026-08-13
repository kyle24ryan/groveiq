import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { sunTimesLocal } from '../suncalc';
import { GROVE_LAT, GROVE_LON } from '../nws';

type ForecastRow = {
  date: string;
  low_temp_f: number | null;
  high_temp_f: number | null;
  wind_gust_mph: number | null;
  precip_chance_pct: number | null;
  frost_risk: number;
  fetched_at: string;
};

async function handleForecast(env: Env, headers: HeadersInit): Promise<Response> {
  const { results } = await env.DB.prepare(`SELECT * FROM forecasts WHERE date >= date('now') ORDER BY date ASC LIMIT 7`).all<ForecastRow>();
  return Response.json({ forecasts: results }, { headers });
}

async function handleSun(request: Request, headers: HeadersInit): Promise<Response> {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const date = dateParam ? new Date(`${dateParam}T00:00:00Z`) : new Date();
  const times = sunTimesLocal(date, GROVE_LAT, GROVE_LON);
  return Response.json(times, { headers });
}

type RegionalAqiRow = {
  ts: string;
  airnow_aqi: number | null;
  airnow_category: string | null;
  reporting_area: string | null;
};

async function handleRegionalAqi(env: Env, headers: HeadersInit): Promise<Response> {
  const row = await env.DB.prepare(`SELECT ts, airnow_aqi, airnow_category, reporting_area FROM regional_air_quality ORDER BY ts DESC LIMIT 1`).first<RegionalAqiRow>();
  return Response.json({ observation: row ?? null }, { headers });
}

export async function handleForecastRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS' && (pathname === '/api/v1/forecast' || pathname === '/api/v1/sun' || pathname === '/api/v1/regional-aqi/latest')) {
    return new Response(null, { headers });
  }
  if (pathname === '/api/v1/forecast' && request.method === 'GET') {
    return handleForecast(env, headers);
  }
  if (pathname === '/api/v1/sun' && request.method === 'GET') {
    return handleSun(request, headers);
  }
  if (pathname === '/api/v1/regional-aqi/latest' && request.method === 'GET') {
    return handleRegionalAqi(env, headers);
  }
  return null;
}
