// AirNow (EPA) regional AQI. Free, requires signup for an API key.
//
// Uses the FORECAST endpoint (latLong variant), not the observation
// endpoint originally tried here -- North Bend has no physical AirNow
// monitoring station nearby (confirmed empirically: observation queries
// returned empty even at a 200-mile radius, while a much closer point like
// Issaquah also came back empty, ruling out "just needs more radius").
// The forecast endpoint instead covers North Bend via a regional forecast
// zone ("Cascade foothills of King-Pierce Counties", issued by Puget Sound
// Clean Air Agency) rather than requiring a monitor at the exact point --
// a better fit for this app's wildfire-smoke-season use case anyway, since
// it comes with a human-written discussion of where smoke is expected.
// zipCode and latLong variants return identical data for this location
// (verified); latLong used here to share GROVE_LAT/GROVE_LON with nws.ts
// rather than maintaining a second "where is the grove" constant.

import type { Env } from './env';
import { GROVE_LAT, GROVE_LON } from './nws';

export type AirNowObservation = {
  aqi: number | null;
  category: string | null;
  reportingArea: string | null;
  discussion: string | null;
};

// Verified against a real response from /aq/forecast/zipCode/ on
// 2026-08-13 -- PascalCase, and the date field is DateForecast, not
// dateValid (that name belongs to a different AirNow endpoint variant;
// mixing the two up is what silently broke this the first time).
type AirNowForecastRow = {
  DateForecast: string;
  ReportingArea: string;
  ParameterName: string;
  AQI: number;
  Category?: { Name: string };
  Discussion?: string;
};

export async function fetchAirNow(env: Env): Promise<AirNowObservation | null> {
  if (!env.AIRNOW_API_KEY) return null;

  const url = new URL('https://www.airnowapi.org/aq/forecast/latLong/');
  url.searchParams.set('format', 'application/json');
  url.searchParams.set('latitude', String(GROVE_LAT));
  url.searchParams.set('longitude', String(GROVE_LON));
  url.searchParams.set('API_KEY', env.AIRNOW_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`AirNow API returned ${response.status}`);
  }

  const body = (await response.json()) as AirNowForecastRow[];
  const today = new Date().toISOString().slice(0, 10);
  // Prefer today's forecast; fall back to whatever's first if the date
  // match misses (e.g. right at a day boundary).
  const pm25 = body.find((r) => r.ParameterName === 'PM2.5' && r.DateForecast === today) ?? body.find((r) => r.ParameterName === 'PM2.5');
  if (!pm25) return null;

  return {
    aqi: pm25.AQI,
    category: pm25.Category?.Name ?? null,
    reportingArea: pm25.ReportingArea ?? null,
    discussion: pm25.Discussion?.trim() ?? null,
  };
}

export async function writeAirNowObservation(env: Env, obs: AirNowObservation): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO regional_air_quality (airnow_aqi, airnow_category, reporting_area, discussion) VALUES (?, ?, ?, ?)`
  )
    .bind(obs.aqi, obs.category, obs.reportingArea, obs.discussion)
    .run();
}
