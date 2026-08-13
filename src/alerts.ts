// Alerts, two sources:
// - "current": edge-triggered off the live Ecowitt feed every 5-minute poll
//   (wind, heat/WBGT, AQI right now).
// - "forecast": SPEC.md 1.5's actual examples ("frost tonight", "wind gusts
//   >25mph") - evaluated once daily from the NWS forecast, per spec's own
//   "checked once daily" cadence for forward-looking alerts.

import type { Env } from './env';
import type { EcowittConditions } from './ecowitt';
import type { DailyForecast } from './nws';

type AlertType = 'wind' | 'heat' | 'aqi' | 'frost' | 'wind_gust_forecast';
type Source = 'current' | 'forecast';
type Tier = 'watch' | 'urgent';

type EvalResult = { tier: Tier | null; value: number | null };

async function upsertAlert(env: Env, type: AlertType, source: Source, result: EvalResult, message: string): Promise<void> {
  const active = await env.DB.prepare(`SELECT id, tier FROM alerts WHERE alert_type = ? AND resolved_at IS NULL ORDER BY triggered_at DESC LIMIT 1`)
    .bind(type)
    .first<{ id: number; tier: Tier }>();

  if (result.tier === null) {
    if (active) {
      await env.DB.prepare(`UPDATE alerts SET resolved_at = datetime('now') WHERE id = ?`).bind(active.id).run();
    }
    return;
  }

  if (active && active.tier === result.tier) {
    return; // already active at this tier — edge-triggered, don't re-fire
  }

  if (active && active.tier !== result.tier) {
    // Tier changed (e.g. watch -> urgent) — close the old one, open a new one.
    await env.DB.prepare(`UPDATE alerts SET resolved_at = datetime('now') WHERE id = ?`).bind(active.id).run();
  }

  await env.DB.prepare(`INSERT INTO alerts (alert_type, source, tier, message, reading_value) VALUES (?, ?, ?, ?, ?)`)
    .bind(type, source, result.tier, message, result.value)
    .run();
}

// ---- Current-condition (5-min poll) ----

function evaluateWind(mph: number | null): EvalResult {
  if (mph == null) return { tier: null, value: null };
  if (mph > 25) return { tier: 'urgent', value: mph };
  if (mph > 15) return { tier: 'watch', value: mph };
  return { tier: null, value: mph };
}

function evaluateHeat(wbgtC: number | null): EvalResult {
  if (wbgtC == null) return { tier: null, value: null };
  if (wbgtC > 30) return { tier: 'urgent', value: wbgtC };
  if (wbgtC > 27) return { tier: 'watch', value: wbgtC };
  return { tier: null, value: wbgtC };
}

function evaluateAqi(aqi: number | null): EvalResult {
  if (aqi == null) return { tier: null, value: null };
  if (aqi > 150) return { tier: 'urgent', value: aqi };
  if (aqi > 100) return { tier: 'watch', value: aqi };
  return { tier: null, value: aqi };
}

export async function evaluateConditionAlerts(env: Env, conditions: EcowittConditions): Promise<void> {
  const wind = evaluateWind(conditions.windMph);
  await upsertAlert(env, 'wind', 'current', wind, `Wind speed at ${wind.value?.toFixed(0)} mph.`);

  const heat = evaluateHeat(conditions.wbgtC);
  await upsertAlert(env, 'heat', 'current', heat, `WBGT heat index at ${heat.value?.toFixed(1)}°C.`);

  const aqi = evaluateAqi(conditions.pm25Aqi);
  await upsertAlert(env, 'aqi', 'current', aqi, `Air Quality Index at ${aqi.value?.toFixed(0)}.`);
}

// ---- Forecast (once daily, NWS) ----

function evaluateFrost(days: DailyForecast[]): EvalResult {
  // Next 48 hours, matching spec's "frost tonight" framing plus the
  // following night. reading_value stored as the lowest forecast low, in
  // Celsius to match every other alert's canonical unit.
  const next2 = days.slice(0, 2);
  const risk = next2.some((d) => d.frostRisk);
  if (!risk) return { tier: null, value: null };
  const lowestF = Math.min(...next2.filter((d) => d.lowTempF !== null).map((d) => d.lowTempF as number));
  const lowestC = ((lowestF - 32) * 5) / 9;
  return { tier: 'watch', value: lowestC };
}

function evaluateWindGustForecast(days: DailyForecast[]): EvalResult {
  const next2 = days.slice(0, 2);
  const maxGust = Math.max(0, ...next2.map((d) => d.windGustMph ?? 0));
  if (maxGust > 25) return { tier: 'urgent', value: maxGust };
  if (maxGust > 20) return { tier: 'watch', value: maxGust };
  return { tier: null, value: null };
}

export async function evaluateForecastAlerts(env: Env, days: DailyForecast[]): Promise<void> {
  const frost = evaluateFrost(days);
  await upsertAlert(env, 'frost', 'forecast', frost, `Frost risk in the next 48 hours, forecast low ${frost.value?.toFixed(1)}°C.`);

  const gust = evaluateWindGustForecast(days);
  await upsertAlert(env, 'wind_gust_forecast', 'forecast', gust, `Forecast wind gusts up to ${gust.value?.toFixed(0)} mph in the next 48 hours.`);
}
