// Alerts, three sources:
// - "current": edge-triggered off the live Ecowitt feed every 5-minute poll
//   (wind, heat/WBGT, AQI right now).
// - "forecast": SPEC.md 1.5's actual examples ("frost tonight", "wind gusts
//   >25mph") - evaluated once daily from the NWS forecast, per spec's own
//   "checked once daily" cadence for forward-looking alerts.
// - "device": irrigation-reported, off the */5 poll alongside "current".

import type { Env } from './env';
import type { EcowittConditions } from './ecowitt';
import type { DailyForecast } from './nws';
import { sendAlertEmail } from './email';
import { sendOperationalSms } from './sms/sendService';
import { getPrimaryPhoneContact } from './sms/consent';
import { sendPushToAll } from './push';

type AlertType = 'wind' | 'heat' | 'aqi' | 'frost' | 'wind_gust_forecast' | 'irrigation_fault' | 'irrigation_stale';
type Source = 'current' | 'forecast' | 'device';
type Tier = 'watch' | 'urgent';

type EvalResult = { tier: Tier | null; value: number | null };

// Tiered delivery per SPEC.md 1.5: watch -> email + push, urgent -> email +
// push + SMS, silent on recovery. Only fires on a genuinely new alert
// (edge-triggered, same as the alerts table itself) -- never on every
// poll. Push has no consent/compliance gate like SMS -- the browser
// permission prompt already is the opt-in, so it fires at both tiers like
// email rather than being reserved for urgent only.
async function deliverAlert(env: Env, tier: Tier, message: string): Promise<void> {
  await sendAlertEmail(env, `GroveIQ ${tier} alert`, message);
  await sendPushToAll(env, { title: `GroveIQ ${tier} alert`, body: message, url: '/' });

  if (tier !== 'urgent') return;

  const contact = await getPrimaryPhoneContact(env);
  if (!contact) return; // no phone on file yet -- authorizeOperationalSend would reject anyway, skip the query
  await sendOperationalSms(env, {
    phoneContactId: contact.id,
    category: 'environment_weather',
    body: `GroveIQ weather alert: ${message} Reply STOP to opt out.`,
    templateVersion: 'weather-alert-v1',
  });
}

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

  await deliverAlert(env, result.tier, message);
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

// ---- Irrigation (5-min poll, alongside the current-condition alerts above) ----

// Discrete past-tense events -- the device successfully closed the valve
// and told us why -- not an ongoing condition. Unlike upsertAlert's
// weather-style evaluators, there's no later "cleared" moment to
// auto-resolve on, so this inserts and resolves in the same call. The
// point is the notification (email/push/SMS), not a persistent "active"
// banner for something that already finished.
export async function raiseIrrigationFaultAlert(env: Env, message: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO alerts (alert_type, source, tier, message, resolved_at) VALUES ('irrigation_fault', 'device', 'urgent', ?, datetime('now'))`)
    .bind(message)
    .run();
  await deliverAlert(env, 'urgent', message);
}

export const STALE_CLAIM_GRACE_SEC = 60;

type StaleClaimRow = { id: number; tree_id: string; zone_id: string | null; requested_duration_sec: number; claimed_at: string };

// Pure decision function -- unit-tested directly without any D1
// dependency, same pattern as dailyDiagnostic.ts's shouldRunDiagnostic.
export function isClaimStale(claimedAt: string, requestedDurationSec: number, now: Date): boolean {
  const claimedMs = new Date(claimedAt).getTime();
  const deadlineMs = claimedMs + (requestedDurationSec + STALE_CLAIM_GRACE_SEC) * 1000;
  return now.getTime() > deadlineMs;
}

// Unlike a no-flow/max-runtime abort (the device successfully closed the
// valve and told us why), this is the case the 5-zone firmware brief
// itself calls out as unrecoverable from the device's side: a command was
// claimed, its requested duration plus a grace period has passed, and no
// /confirm ever arrived. The valve *might still be open* and nobody would
// know without this check. Reuses upsertAlert's edge-triggered engine --
// given the one-active-zone-max invariant, there's at most one relevant
// claim at a time, so "is anything currently stale" is the same shape as
// the weather evaluators above.
export async function sweepStaleIrrigationCommands(env: Env, now: Date = new Date()): Promise<void> {
  const { results: claimed } = await env.DB.prepare(
    `SELECT id, tree_id, zone_id, requested_duration_sec, claimed_at FROM irrigation_events WHERE status = 'claimed' AND claimed_at IS NOT NULL`
  ).all<StaleClaimRow>();

  const stale = claimed.filter((row) => isClaimStale(row.claimed_at, row.requested_duration_sec, now));

  if (stale.length === 0) {
    await upsertAlert(env, 'irrigation_stale', 'device', { tier: null, value: null }, '');
    return;
  }

  // Move each stale row to a terminal state so the next sweep doesn't
  // find it again -- otherwise the alert would never resolve even though
  // it already fired once.
  for (const row of stale) {
    await env.DB.prepare(`UPDATE irrigation_events SET status = 'aborted', aborted_reason = 'device_unresponsive' WHERE id = ?`).bind(row.id).run();
  }

  const treeIds = [...new Set(stale.map((r) => r.tree_id))].join(', ');
  await upsertAlert(
    env,
    'irrigation_stale',
    'device',
    { tier: 'urgent', value: null },
    `Irrigation command for ${treeIds} never confirmed -- the valve may still be open. Check the controller.`
  );
}
