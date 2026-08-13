// Current-condition weather alerts, edge-triggered off the live Ecowitt
// feed. Not the NWS-forecast-based "frost tonight / wind gusts >25mph"
// alerts SPEC.md 1.5 describes -- those need forecast data this doesn't
// have. This covers what's evaluable right now from conditions_readings:
// sustained wind, WBGT heat stress, and AQI.

import type { Env } from './env';
import type { EcowittConditions } from './ecowitt';

type AlertType = 'wind' | 'heat' | 'aqi';
type Tier = 'watch' | 'urgent';

type EvalResult = { tier: Tier | null; value: number | null };

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

const buildMessage: Record<AlertType, (tier: Tier, value: number) => string> = {
  wind: (tier, v) => `Wind speed at ${v.toFixed(0)} mph${tier === 'urgent' ? ' — high wind' : ' — elevated wind'}.`,
  heat: (tier, v) => `WBGT heat index at ${v.toFixed(1)}°C${tier === 'urgent' ? ' — significant heat stress risk' : ' — elevated heat stress'}.`,
  aqi: (tier, v) => `Air Quality Index at ${v.toFixed(0)}${tier === 'urgent' ? ' — unhealthy air' : ' — moderate/unhealthy for sensitive groups'}.`,
};

export async function evaluateConditionAlerts(env: Env, conditions: EcowittConditions): Promise<void> {
  const checks: { type: AlertType; result: EvalResult }[] = [
    { type: 'wind', result: evaluateWind(conditions.windMph) },
    { type: 'heat', result: evaluateHeat(conditions.wbgtC) },
    { type: 'aqi', result: evaluateAqi(conditions.pm25Aqi) },
  ];

  for (const { type, result } of checks) {
    const active = await env.DB.prepare(`SELECT id, tier FROM alerts WHERE alert_type = ? AND resolved_at IS NULL ORDER BY triggered_at DESC LIMIT 1`)
      .bind(type)
      .first<{ id: number; tier: Tier }>();

    if (result.tier === null) {
      if (active) {
        await env.DB.prepare(`UPDATE alerts SET resolved_at = datetime('now') WHERE id = ?`).bind(active.id).run();
      }
      continue;
    }

    if (active && active.tier === result.tier) {
      continue; // already active at this tier — edge-triggered, don't re-fire
    }

    if (active && active.tier !== result.tier) {
      // Tier changed (e.g. watch -> urgent) — close the old one, open a new one.
      await env.DB.prepare(`UPDATE alerts SET resolved_at = datetime('now') WHERE id = ?`).bind(active.id).run();
    }

    const message = buildMessage[type](result.tier, result.value as number);
    await env.DB.prepare(`INSERT INTO alerts (alert_type, tier, message, reading_value) VALUES (?, ?, ?, ?)`)
      .bind(type, result.tier, message, result.value)
      .run();
  }
}
