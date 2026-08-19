import type { Env } from './env';
import { diagnoseTreeSensorData } from './claude';
import { computeEvidence, type EvidenceEngineInput, type RawSoilReading, type RawConditionsReading } from './evidenceEngine';
import { todayGroveLocalDateStr } from './dailyRollup';

// Once-daily-per-tree AI synthesis, run alongside the daily_readings
// rollup so it can see that day's history. Writes into `analyses` as
// kind='sensor' -- additive to, not a replacement for, the deterministic
// threshold/trend engine (frontend/src/data/realTreeAnalysis.ts) that
// still drives every status badge and alert. See the guardrail history
// note at the top of src/claude.ts.
//
// Hardening pass (migration 0015, same day): evidence is now computed by
// src/evidenceEngine.ts from real sub-daily sensor history instead of
// being handed to Claude as a few raw numbers, each diagnosis is recorded
// with enough audit detail to reproduce it, duplicate diagnoses for the
// same tree/day are suppressed via input_hash, and stable trees stop
// being re-diagnosed every single day (see shouldRunDiagnostic below).

const STABLE_REDIAGNOSE_DAYS = 7;
const RAW_SOIL_WINDOW_HOURS = 48;
const RAW_CONDITIONS_WINDOW_HOURS = 24;

type TreeRow = {
  id: string;
  name: string;
  species: string;
  development_stage: string;
  soil_moisture_threshold_low: number;
  soil_moisture_threshold_high: number;
  ec_threshold_high: number;
  dormancy_soil_temp_c: number;
};

type LatestSoilRow = {
  soil_moisture_pct: number | null;
  soil_temp_c: number | null;
  soil_ec: number | null;
  ts: string;
};

type DailyRow = {
  date: string;
  soil_moisture_avg: number | null;
  soil_ec_avg: number | null;
};

type LastAnalysisRow = { status: string; ts: string };

// Pure decision function -- unit-tested directly in dailyDiagnostic.test.ts
// without any D1 dependency, same pattern as dailyRollup.ts's pure date
// helpers being tested separately from the D1-touching rollup itself.
//
// Anomaly-triggered cadence: a tree whose deterministic status isn't 'ok'
// gets diagnosed every day the anomaly persists (covers both a brand-new
// anomaly and an ongoing one -- the once-daily cron can't tell "new" from
// "ongoing" apart, only whether the anomaly is still there today). A
// stable tree only gets a quiet re-diagnosis once a week. True
// immediate-on-transition diagnosis needs a sub-daily trigger and is
// deliberately deferred -- see design doc.
export function shouldRunDiagnostic(
  mirroredStatus: 'ok' | 'watch' | 'urgent',
  lastAnalysis: LastAnalysisRow | null,
  now: Date
): { run: boolean; reason: string } {
  if (mirroredStatus !== 'ok') {
    return { run: true, reason: lastAnalysis ? 'anomaly active' : 'new anomaly' };
  }
  if (!lastAnalysis) {
    return { run: true, reason: 'no prior diagnosis' };
  }
  const daysSinceLast = (now.getTime() - new Date(lastAnalysis.ts).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLast >= STABLE_REDIAGNOSE_DAYS) {
    return { run: true, reason: 'weekly summary' };
  }
  return { run: false, reason: 'stable, diagnosed recently' };
}

// Hashes the raw D1 snapshot the evidence was built from, NOT the computed
// Evidence object itself. Evidence embeds wall-clock-relative fields
// (readingAgeHours, moistureChange, dryDown's hoursSincePeak) that drift
// continuously with `now` -- two calls made a minute apart over identical
// underlying data would otherwise almost never hash the same, defeating
// the entire point of dedup (the target case IS "a cron retry or debug
// hit a few minutes after the first call, nothing new arrived"). Hashing
// the raw inputs instead means the hash only changes when there's
// actually new sensor data to react to.
async function computeInputHash(
  treeId: string,
  dateStr: string,
  rawSnapshot: {
    thresholds: unknown;
    latestSoil: unknown;
    dailyHistory: unknown;
    recentSoilReadings: unknown;
    recentConditions: unknown;
    companion: unknown;
  }
): Promise<string> {
  const payload = JSON.stringify({ tree_id: treeId, date: dateStr, ...rawSnapshot });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function runDailyDiagnostics(
  env: Env
): Promise<{ treesDiagnosed: number; treesSkippedNoData: number; treesSkippedStable: number; treesSkippedDuplicate: number; errors: string[] }> {
  const errors: string[] = [];
  const { results: trees } = await env.DB.prepare(
    `SELECT id, name, species, development_stage, soil_moisture_threshold_low, soil_moisture_threshold_high, ec_threshold_high, dormancy_soil_temp_c FROM trees`
  ).all<TreeRow>();

  const now = new Date();
  let treesDiagnosed = 0;
  let treesSkippedNoData = 0;
  let treesSkippedStable = 0;
  let treesSkippedDuplicate = 0;

  for (const tree of trees) {
    try {
      const latestSoil = await env.DB.prepare(`SELECT soil_moisture_pct, soil_temp_c, soil_ec, ts FROM soil_readings WHERE tree_id = ? ORDER BY ts DESC LIMIT 1`)
        .bind(tree.id)
        .first<LatestSoilRow>();

      // No sensor data at all yet for this tree -- nothing honest to
      // diagnose, and every field the evidence engine computes would be
      // "unknown."
      if (!latestSoil || latestSoil.soil_moisture_pct == null) {
        treesSkippedNoData++;
        continue;
      }

      const { results: dailyRowsDesc } = await env.DB.prepare(`SELECT date, soil_moisture_avg, soil_ec_avg FROM daily_readings WHERE tree_id = ? ORDER BY date DESC LIMIT 14`)
        .bind(tree.id)
        .all<DailyRow>();
      const dailyHistory = dailyRowsDesc
        .filter((r) => r.soil_moisture_avg != null)
        .reverse()
        .map((r) => ({ date: r.date, moistureAvg: r.soil_moisture_avg!, ecAvg: r.soil_ec_avg }));

      const rawSoilCutoff = new Date(now.getTime() - RAW_SOIL_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const { results: recentSoilReadings } = await env.DB.prepare(
        `SELECT ts, soil_moisture_pct, soil_temp_c, soil_ec FROM soil_readings WHERE tree_id = ? AND ts >= ? ORDER BY ts ASC`
      )
        .bind(tree.id, rawSoilCutoff)
        .all<RawSoilReading & { soil_moisture_pct: number | null; soil_temp_c: number | null; soil_ec: number | null }>();

      const rawConditionsCutoff = new Date(now.getTime() - RAW_CONDITIONS_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const { results: recentConditionsRows } = await env.DB.prepare(
        `SELECT ts, outdoor_temp_c, humidity_pct, wind_mph, rain_in, solar_wm2 FROM conditions_readings WHERE ts >= ? ORDER BY ts ASC`
      )
        .bind(rawConditionsCutoff)
        .all<{ ts: string; outdoor_temp_c: number | null; humidity_pct: number | null; wind_mph: number | null; rain_in: number | null; solar_wm2: number | null }>();
      const recentConditions: RawConditionsReading[] = recentConditionsRows.map((r) => ({
        ts: r.ts,
        tempC: r.outdoor_temp_c,
        humidityPct: r.humidity_pct,
        windMph: r.wind_mph,
        rainIn: r.rain_in,
        solarWm2: r.solar_wm2,
      }));

      const speciesRow = await env.DB.prepare('SELECT ai_notes FROM species_reference WHERE species = ?').bind(tree.species).first<{ ai_notes: string | null }>();

      const companionRow = await env.DB.prepare('SELECT id FROM trees WHERE species = ? AND id != ? LIMIT 1').bind(tree.species, tree.id).first<{ id: string }>();
      let companion: EvidenceEngineInput['companion'];
      if (companionRow) {
        const companionSoil = await env.DB.prepare(`SELECT soil_moisture_pct, ts FROM soil_readings WHERE tree_id = ? ORDER BY ts DESC LIMIT 1`)
          .bind(companionRow.id)
          .first<{ soil_moisture_pct: number | null; ts: string }>();
        companion = { treeId: companionRow.id, latestSoil: companionSoil ? { moisturePct: companionSoil.soil_moisture_pct, ts: companionSoil.ts } : null };
      }

      const thresholds = {
        moistureLow: tree.soil_moisture_threshold_low,
        moistureHigh: tree.soil_moisture_threshold_high,
        ecHigh: tree.ec_threshold_high,
        dormancySoilTempC: tree.dormancy_soil_temp_c,
      };

      const evidence = computeEvidence({
        now,
        thresholds,
        latestSoil: { moisturePct: latestSoil.soil_moisture_pct, tempC: latestSoil.soil_temp_c, ec: latestSoil.soil_ec, ts: latestSoil.ts },
        recentSoilReadings: recentSoilReadings.map((r) => ({ ts: r.ts, moisturePct: r.soil_moisture_pct, tempC: r.soil_temp_c, ec: r.soil_ec })),
        dailyHistory,
        recentConditions,
        companion,
      });

      const lastAnalysis = await env.DB.prepare(`SELECT status, ts FROM analyses WHERE tree_id = ? AND kind = 'sensor' ORDER BY ts DESC LIMIT 1`)
        .bind(tree.id)
        .first<LastAnalysisRow>();

      const cadence = shouldRunDiagnostic(evidence.mirroredStatus.status, lastAnalysis ?? null, now);
      if (!cadence.run) {
        treesSkippedStable++;
        continue;
      }

      const dateStr = todayGroveLocalDateStr(now);
      const inputHash = await computeInputHash(tree.id, dateStr, { thresholds, latestSoil, dailyHistory, recentSoilReadings, recentConditions, companion });

      const existing = await env.DB.prepare('SELECT id FROM analyses WHERE tree_id = ? AND input_hash = ?').bind(tree.id, inputHash).first<{ id: number }>();
      if (existing) {
        treesSkippedDuplicate++;
        continue;
      }

      const dataStartTs = recentSoilReadings[0]?.ts ?? latestSoil.ts;

      const result = await diagnoseTreeSensorData(env, {
        treeName: tree.name,
        species: tree.species,
        speciesNotes: speciesRow?.ai_notes ?? undefined,
        developmentStage: tree.development_stage,
        thresholds,
        evidence,
      });

      try {
        await env.DB.prepare(
          `INSERT INTO analyses
             (tree_id, kind, source, status, summary, detail, model, provider, model_version, prompt_version, input_hash, evidence_json, output_json, confidence, data_start_ts, data_end_ts)
           VALUES (?, 'sensor', 'scheduled', ?, ?, ?, ?, 'anthropic', ?, 'sensor-v1', ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            tree.id,
            result.status,
            result.summary,
            result.detail,
            'claude-sonnet-5',
            result.modelVersion,
            inputHash,
            JSON.stringify(evidence),
            JSON.stringify({ status: result.status, confidence: result.confidence, summary: result.summary, detail: result.detail }),
            result.confidence,
            dataStartTs,
            latestSoil.ts
          )
          .run();
      } catch (insertErr) {
        // Backstop against the UNIQUE(tree_id, input_hash) index -- a race
        // between the cron and a concurrent debug-route call is the only
        // realistic way to get here, since the SELECT-before-insert above
        // already covers the common case. Treated as a clean dedup skip,
        // not a real error.
        if (String(insertErr).toLowerCase().includes('unique')) {
          treesSkippedDuplicate++;
          continue;
        }
        throw insertErr;
      }

      treesDiagnosed++;
    } catch (err) {
      errors.push(`${tree.id}: ${String(err)}`);
    }
  }

  return { treesDiagnosed, treesSkippedNoData, treesSkippedStable, treesSkippedDuplicate, errors };
}
