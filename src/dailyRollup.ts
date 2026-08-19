// Rolls up per-tree soil_readings (5-min granularity) and shared
// conditions_readings into one daily_readings row per tree per grove-local
// calendar day. daily_readings already existed in schema.sql but nothing
// wrote to it until now -- it's what powers real trend charts/history,
// as opposed to soil_readings' raw 5-min granularity (fine for "current
// reading," too granular for "last 30 days").

import type { Env } from './env';

// America/Los_Angeles's current UTC offset (minutes), computed rather than
// hardcoded so PST/PDT transitions are handled automatically -- same
// principle as the grove-local date fixes in airnow.ts and firms.ts.
function pacificOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' }).formatToParts(date);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-8';
  const match = /GMT([+-]\d+)/.exec(offsetPart);
  return match ? Number(match[1]) * 60 : -480;
}

// [startUtcIso, endUtcIso) bounding one grove-local calendar date.
function groveLocalDayBoundsUtc(localDateStr: string): { startUtc: string; endUtc: string } {
  const midnightGuessUtc = new Date(`${localDateStr}T00:00:00Z`);
  const offsetMin = pacificOffsetMinutes(midnightGuessUtc);
  const startMs = midnightGuessUtc.getTime() - offsetMin * 60000;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { startUtc: new Date(startMs).toISOString(), endUtc: new Date(endMs).toISOString() };
}

// Yesterday's date, grove-local. Called from the 13:00 UTC daily cron
// (~5-6am Pacific) -- by then the previous grove-local calendar day is
// fully complete and won't get any more late-arriving readings, so it's
// safe to roll up as final rather than a still-in-progress partial day.
export function yesterdayGroveLocalDateStr(now: Date = new Date()): string {
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = todayLocal.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

// Today's date, grove-local. Used by the diagnostic dedup hash (input_hash
// needs to change once per grove-local day, not once per UTC day) -- same
// `Intl`-based America/Los_Angeles lookup as yesterdayGroveLocalDateStr,
// just without stepping back a day.
export function todayGroveLocalDateStr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

type SoilAgg = {
  tree_id: string;
  moisture_avg: number | null;
  moisture_min: number | null;
  moisture_max: number | null;
  temp_avg: number | null;
  ec_avg: number | null;
};

type ConditionsAgg = {
  outdoor_temp_avg: number | null;
  outdoor_temp_min: number | null;
  humidity_avg: number | null;
  wind_max: number | null;
  rain_total: number | null;
  black_globe_max: number | null;
  pm25_avg: number | null;
};

// Rolls up one grove-local date's readings into daily_readings, one row
// per tree that has soil data for that day. Idempotent -- daily_readings
// has UNIQUE(tree_id, date), so re-running for an already-rolled-up date
// just replaces it (useful if the cron is ever re-triggered or a backfill
// is needed).
//
// rain_total takes MAX(rain_in), not SUM -- conditions_readings.rain_in
// stores Ecowitt's own cumulative daily rain counter at each 5-min
// snapshot, not a rate; summing snapshots of a running total would wildly
// over-count.
export async function rollUpDailyReadings(env: Env, localDateStr: string): Promise<{ treesRolledUp: number }> {
  const { startUtc, endUtc } = groveLocalDayBoundsUtc(localDateStr);

  const { results: soilAggs } = await env.DB.prepare(
    `SELECT tree_id,
            AVG(soil_moisture_pct) as moisture_avg, MIN(soil_moisture_pct) as moisture_min, MAX(soil_moisture_pct) as moisture_max,
            AVG(soil_temp_c) as temp_avg, AVG(soil_ec) as ec_avg
     FROM soil_readings WHERE ts >= ? AND ts < ? GROUP BY tree_id`
  )
    .bind(startUtc, endUtc)
    .all<SoilAgg>();

  if (soilAggs.length === 0) return { treesRolledUp: 0 };

  const conditionsAgg = await env.DB.prepare(
    `SELECT AVG(outdoor_temp_c) as outdoor_temp_avg, MIN(outdoor_temp_c) as outdoor_temp_min,
            AVG(humidity_pct) as humidity_avg, MAX(wind_mph) as wind_max,
            MAX(rain_in) as rain_total, MAX(black_globe_temp_c) as black_globe_max,
            AVG(pm25) as pm25_avg
     FROM conditions_readings WHERE ts >= ? AND ts < ?`
  )
    .bind(startUtc, endUtc)
    .first<ConditionsAgg>();

  for (const soil of soilAggs) {
    await env.DB.prepare(
      `INSERT INTO daily_readings
         (tree_id, date, soil_moisture_avg, soil_moisture_min, soil_moisture_max, soil_temp_avg, soil_ec_avg,
          outdoor_temp_avg, outdoor_temp_min, humidity_avg, wind_max, rain_total, black_globe_max, pm25_avg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tree_id, date) DO UPDATE SET
         soil_moisture_avg = excluded.soil_moisture_avg, soil_moisture_min = excluded.soil_moisture_min, soil_moisture_max = excluded.soil_moisture_max,
         soil_temp_avg = excluded.soil_temp_avg, soil_ec_avg = excluded.soil_ec_avg,
         outdoor_temp_avg = excluded.outdoor_temp_avg, outdoor_temp_min = excluded.outdoor_temp_min, humidity_avg = excluded.humidity_avg,
         wind_max = excluded.wind_max, rain_total = excluded.rain_total, black_globe_max = excluded.black_globe_max, pm25_avg = excluded.pm25_avg`
    )
      .bind(
        soil.tree_id,
        localDateStr,
        soil.moisture_avg,
        soil.moisture_min,
        soil.moisture_max,
        soil.temp_avg,
        soil.ec_avg,
        conditionsAgg?.outdoor_temp_avg ?? null,
        conditionsAgg?.outdoor_temp_min ?? null,
        conditionsAgg?.humidity_avg ?? null,
        conditionsAgg?.wind_max ?? null,
        conditionsAgg?.rain_total ?? null,
        conditionsAgg?.black_globe_max ?? null,
        conditionsAgg?.pm25_avg ?? null
      )
      .run();
  }

  return { treesRolledUp: soilAggs.length };
}
