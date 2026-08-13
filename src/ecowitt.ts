// Ecowitt Cloud API integration.
//
// VERIFIED against a real payload from this account's GW3000 + WS69 + WH41 +
// WittBoy BGT on 2026-08-12 (see git history for the raw response). Field
// names below are confirmed, not guessed — but note Ecowitt's own docs say
// shape can still vary by firmware/hardware combo, so if a future account
// or sensor swap breaks this, re-verify against /api/debug/ecowitt rather
// than assuming.

import type { Env } from './env';

const ECOWITT_BASE_URL = 'https://api.ecowitt.net/api/v3/device/real_time';

export type EcowittConditions = {
  outdoorTempC: number | null;
  humidityPct: number | null;
  windMph: number | null;
  windGustMph: number | null;
  rainRateIn: number | null;
  rainDailyIn: number | null;
  pressureHpa: number | null;
  solarWm2: number | null;
  uvi: number | null;
  pm25: number | null;
  blackGlobeTempC: number | null;
  wbgtC: number | null;
};

export type EcowittSoilChannel = {
  channel: number;
  soilMoisturePct: number | null;
};

export type EcowittReading = {
  fetchedAt: string;
  conditions: EcowittConditions;
  soilChannels: EcowittSoilChannel[];
  raw: unknown; // kept for debugging until the shape is confirmed
};

function num(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Ecowitt nests most fields as { time, unit, value } — this pulls .value
// out of that shape, tolerating a bare value too in case a field doesn't
// follow the pattern.
function extractValue(node: unknown): unknown {
  if (node && typeof node === 'object' && 'value' in (node as Record<string, unknown>)) {
    return (node as Record<string, unknown>).value;
  }
  return node;
}

export async function fetchEcowittRealTime(env: Env): Promise<EcowittReading | null> {
  if (!env.ECOWITT_APPLICATION_KEY || !env.ECOWITT_API_KEY || !env.ECOWITT_MAC) {
    return null;
  }

  const url = new URL(ECOWITT_BASE_URL);
  url.searchParams.set('application_key', env.ECOWITT_APPLICATION_KEY);
  url.searchParams.set('api_key', env.ECOWITT_API_KEY);
  url.searchParams.set('mac', env.ECOWITT_MAC);
  // call_back=all rather than a hand-maintained group whitelist — the
  // whitelist approach silently drops data when a group name is wrong
  // (pm25_aqi vs. the real pm25_ch1, discovered during verification).
  url.searchParams.set('call_back', 'all');
  url.searchParams.set('temp_unitid', '1'); // Celsius
  url.searchParams.set('wind_speed_unitid', '9'); // mph
  url.searchParams.set('pressure_unitid', '3'); // hPa
  url.searchParams.set('rainfall_unitid', '13'); // inches (12 is mm, verified)

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Ecowitt API returned ${response.status}`);
  }

  const body = (await response.json()) as { code: number; msg: string; data?: Record<string, unknown> };
  if (body.code !== 0 || !body.data) {
    throw new Error(`Ecowitt API error: ${body.msg}`);
  }

  const data = body.data;
  const outdoor = (data.outdoor as Record<string, unknown>) ?? {};
  const wind = (data.wind as Record<string, unknown>) ?? {};
  const rainfall = (data.rainfall as Record<string, unknown>) ?? {};
  const pressure = (data.pressure as Record<string, unknown>) ?? {};
  const solar = (data.solar_and_uvi as Record<string, unknown>) ?? {};
  // Verified key is pm25_ch1 (per-channel), not the pm25_aqi group name
  // originally assumed.
  const pm25 = (data.pm25_ch1 as Record<string, unknown>) ?? {};
  // WittBoy BGT sensor — confirmed present on this account.
  const blackGlobe = (data.black_globe_temperature as Record<string, unknown>) ?? {};

  const conditions: EcowittConditions = {
    outdoorTempC: num(extractValue(outdoor.temperature)),
    humidityPct: num(extractValue(outdoor.humidity)),
    windMph: num(extractValue(wind.wind_speed)),
    windGustMph: num(extractValue(wind.wind_gust)),
    rainRateIn: num(extractValue(rainfall.rain_rate)),
    rainDailyIn: num(extractValue(rainfall.daily)),
    pressureHpa: num(extractValue(pressure.relative)),
    solarWm2: num(extractValue(solar.solar)),
    uvi: num(extractValue(solar.uvi)),
    pm25: num(extractValue(pm25.pm25)),
    blackGlobeTempC: num(extractValue(blackGlobe.bgt)),
    wbgtC: num(extractValue(blackGlobe.wbgt)),
  };

  const soilChannels: EcowittSoilChannel[] = [];
  for (let ch = 1; ch <= 5; ch++) {
    const node = data[`soil_ch${ch}`] as Record<string, unknown> | undefined;
    if (!node) continue;
    soilChannels.push({
      channel: ch,
      soilMoisturePct: num(extractValue(node.soilmoisture)),
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    conditions,
    soilChannels,
    raw: body,
  };
}

export async function writeConditionsReading(env: Env, reading: EcowittReading): Promise<void> {
  const c = reading.conditions;
  await env.DB.prepare(
    `INSERT INTO conditions_readings (ts, outdoor_temp_c, humidity_pct, wind_mph, rain_in, black_globe_temp_c, pm25)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(reading.fetchedAt, c.outdoorTempC, c.humidityPct, c.windMph, c.rainDailyIn, c.blackGlobeTempC, c.pm25)
    .run();
}
