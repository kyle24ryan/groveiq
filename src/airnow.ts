// AirNow (EPA) regional AQI. Free, but requires signup for an API key —
// not built/tested against a real key yet, this mirrors ecowitt.ts's
// pattern of no-op'ing gracefully when the secret isn't configured.
// Get a free key at https://docs.airnowapi.org/ and set it with
// `wrangler secret put AIRNOW_API_KEY` to activate.

import type { Env } from './env';
import { GROVE_LAT, GROVE_LON } from './nws';

export type AirNowObservation = {
  aqi: number | null;
  category: string | null;
  reportingArea: string | null;
};

type AirNowApiRow = {
  DateObserved: string;
  HourObserved: number;
  ReportingArea: string;
  ParameterName: string;
  AQI: number;
  Category?: { Name: string };
};

export async function fetchAirNow(env: Env): Promise<AirNowObservation | null> {
  if (!env.AIRNOW_API_KEY) return null;

  const url = new URL('https://www.airnowapi.org/aq/observation/latLong/current/');
  url.searchParams.set('format', 'application/json');
  url.searchParams.set('latitude', String(GROVE_LAT));
  url.searchParams.set('longitude', String(GROVE_LON));
  url.searchParams.set('distance', '25');
  url.searchParams.set('API_KEY', env.AIRNOW_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`AirNow API returned ${response.status}`);
  }

  const body = (await response.json()) as AirNowApiRow[];
  const pm25 = body.find((o) => o.ParameterName === 'PM2.5');
  if (!pm25) return null;

  return {
    aqi: pm25.AQI,
    category: pm25.Category?.Name ?? null,
    reportingArea: pm25.ReportingArea ?? null,
  };
}

export async function writeAirNowObservation(env: Env, obs: AirNowObservation): Promise<void> {
  await env.DB.prepare(`INSERT INTO regional_air_quality (airnow_aqi, airnow_category, reporting_area) VALUES (?, ?, ?)`)
    .bind(obs.aqi, obs.category, obs.reportingArea)
    .run();
}
