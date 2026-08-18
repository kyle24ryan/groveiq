// NWS (api.weather.gov) forecast integration. Free, no API key required.
//
// User-provided GPS coordinates (2026-08-17) -- the previous value was an
// approximate North Bend, WA location, not the actual grove site.
// Verified: /points/47.4776620,-121.7300978 resolves to gridId SEW,
// gridX 142, gridY 58, relativeLocation "North Bend WA" specifically --
// not a generic Seattle station, which SPEC.md 1a explicitly warned about.

import type { Env } from './env';

const GROVE_LAT = 47.4776620;
const GROVE_LON = -121.7300978;
const USER_AGENT = 'GroveIQ (https://grove-iq.com)';

type NwsPeriod = {
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  probabilityOfPrecipitation?: { value: number | null };
};

export type DailyForecast = {
  date: string;
  lowTempF: number | null;
  highTempF: number | null;
  windGustMph: number | null;
  precipChancePct: number | null;
  frostRisk: boolean;
};

async function nwsFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' } });
  if (!res.ok) {
    throw new Error(`NWS API returned ${res.status} for ${url}`);
  }
  return res.json();
}

// NWS forecast periods give windSpeed as free text ("10 to 15 mph", "5 mph")
// rather than a distinct gust field -- the standard /forecast endpoint
// doesn't expose gusts separately from forecastGridData, which has a more
// complex ISO8601-duration time-series shape. Using the high end of the
// forecast wind-speed range as a gust proxy is a simplification, not a
// true gust forecast; flagged here so it isn't mistaken for one later.
function parseMaxWindMph(windSpeed: string): number | null {
  const matches = windSpeed.match(/\d+/g);
  if (!matches) return null;
  return Math.max(...matches.map(Number));
}

export async function fetchNwsForecast(): Promise<DailyForecast[]> {
  const points = (await nwsFetch(`https://api.weather.gov/points/${GROVE_LAT},${GROVE_LON}`)) as {
    properties?: { forecast?: string };
  };
  const forecastUrl = points.properties?.forecast;
  if (!forecastUrl) {
    throw new Error('NWS points response missing forecast URL');
  }

  const forecast = (await nwsFetch(forecastUrl)) as { properties?: { periods?: NwsPeriod[] } };
  const periods = forecast.properties?.periods ?? [];

  const byDate = new Map<string, DailyForecast>();
  for (const period of periods) {
    const date = period.startTime.slice(0, 10);
    const tempF = period.temperatureUnit === 'F' ? period.temperature : (period.temperature * 9) / 5 + 32;
    const windMph = parseMaxWindMph(period.windSpeed);
    const precipPct = period.probabilityOfPrecipitation?.value ?? null;

    const existing: DailyForecast = byDate.get(date) ?? {
      date,
      lowTempF: null,
      highTempF: null,
      windGustMph: null,
      precipChancePct: null,
      frostRisk: false,
    };

    if (period.isDaytime) {
      existing.highTempF = existing.highTempF === null ? tempF : Math.max(existing.highTempF, tempF);
    } else {
      existing.lowTempF = existing.lowTempF === null ? tempF : Math.min(existing.lowTempF, tempF);
      if (tempF <= 32) existing.frostRisk = true;
    }

    if (windMph !== null) {
      existing.windGustMph = existing.windGustMph === null ? windMph : Math.max(existing.windGustMph, windMph);
    }
    if (precipPct !== null) {
      existing.precipChancePct = existing.precipChancePct === null ? precipPct : Math.max(existing.precipChancePct, precipPct);
    }

    byDate.set(date, existing);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function writeForecasts(env: Env, days: DailyForecast[]): Promise<void> {
  for (const d of days) {
    await env.DB.prepare(
      `INSERT INTO forecasts (date, low_temp_f, high_temp_f, wind_gust_mph, precip_chance_pct, frost_risk, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET
         low_temp_f = excluded.low_temp_f,
         high_temp_f = excluded.high_temp_f,
         wind_gust_mph = excluded.wind_gust_mph,
         precip_chance_pct = excluded.precip_chance_pct,
         frost_risk = excluded.frost_risk,
         fetched_at = excluded.fetched_at`
    )
      .bind(d.date, d.lowTempF, d.highTempF, d.windGustMph, d.precipChancePct, d.frostRisk ? 1 : 0)
      .run();
  }
}

// NWS active alerts (watches/warnings/advisories) for the grove's point
// location. Same free/keyless api.weather.gov used for the forecast above.
// Alerts are polygon-based when the issuing office drew one (typically
// severe thunderstorm/tornado warnings), otherwise they're issued against
// county/zone geometry and the API returns geometry: null -- callers must
// not fabricate a shape in that case, just say the alert applies to the
// area without drawing anything on the map.
export type NwsAlertGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null;

export type NwsAlert = {
  id: string;
  event: string;
  severity: string;
  certainty: string;
  urgency: string;
  headline: string | null;
  areaDesc: string;
  effective: string | null;
  onset: string | null;
  expires: string | null;
  ends: string | null;
  senderName: string;
  // api.weather.gov's own canonical URL for this alert -- content-negotiates
  // to a human-readable page in a browser, so it doubles as the "direct NWS
  // link" without us guessing at a public alerts.weather.gov URL pattern.
  webUrl: string;
  geometry: NwsAlertGeometry;
};

type NwsAlertFeature = {
  geometry: NwsAlertGeometry;
  properties: {
    id: string;
    event: string;
    severity: string;
    certainty: string;
    urgency: string;
    headline: string | null;
    areaDesc: string;
    effective: string | null;
    onset: string | null;
    expires: string | null;
    ends: string | null;
    senderName: string;
    ['@id']: string;
  };
};

export async function fetchActiveAlerts(): Promise<NwsAlert[]> {
  const data = (await nwsFetch(`https://api.weather.gov/alerts/active?point=${GROVE_LAT},${GROVE_LON}`)) as {
    features?: NwsAlertFeature[];
  };
  const features = data.features ?? [];
  return features.map((f) => ({
    id: f.properties.id,
    event: f.properties.event,
    severity: f.properties.severity,
    certainty: f.properties.certainty,
    urgency: f.properties.urgency,
    headline: f.properties.headline,
    areaDesc: f.properties.areaDesc,
    effective: f.properties.effective,
    onset: f.properties.onset,
    expires: f.properties.expires,
    ends: f.properties.ends,
    senderName: f.properties.senderName,
    webUrl: f.properties['@id'],
    geometry: f.geometry ?? null,
  }));
}

export { GROVE_LAT, GROVE_LON };
