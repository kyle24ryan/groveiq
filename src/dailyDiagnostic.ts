import type { Env } from './env';
import { diagnoseTreeSensorData } from './claude';

// Once-daily AI synthesis per tree, run alongside the daily_readings
// rollup so it can see that day's history. Writes into `analyses` as
// kind='sensor' -- additive to, not a replacement for, the deterministic
// threshold/trend engine (frontend/src/data/realTreeAnalysis.ts) that
// still drives every status badge and alert. See the guardrail history
// note at the top of src/claude.ts.

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
};

type ConditionsRow = {
  outdoor_temp_c: number | null;
  humidity_pct: number | null;
};

export async function runDailyDiagnostics(env: Env): Promise<{ treesDiagnosed: number; treesSkipped: number; errors: string[] }> {
  const errors: string[] = [];
  const { results: trees } = await env.DB.prepare(
    `SELECT id, name, species, development_stage, soil_moisture_threshold_low, soil_moisture_threshold_high, ec_threshold_high, dormancy_soil_temp_c FROM trees`
  ).all<TreeRow>();

  let treesDiagnosed = 0;
  let treesSkipped = 0;

  for (const tree of trees) {
    try {
      const latestSoil = await env.DB.prepare(`SELECT soil_moisture_pct, soil_temp_c, soil_ec, ts FROM soil_readings WHERE tree_id = ? ORDER BY ts DESC LIMIT 1`)
        .bind(tree.id)
        .first<LatestSoilRow>();

      // No sensor data at all yet for this tree -- nothing honest to
      // diagnose, and every field in the prompt below would be "unknown."
      if (!latestSoil || latestSoil.soil_moisture_pct == null) {
        treesSkipped++;
        continue;
      }

      const { results: dailyRowsDesc } = await env.DB.prepare(`SELECT date, soil_moisture_avg FROM daily_readings WHERE tree_id = ? ORDER BY date DESC LIMIT 14`)
        .bind(tree.id)
        .all<DailyRow>();
      const dailyHistory = dailyRowsDesc
        .filter((r) => r.soil_moisture_avg != null)
        .reverse()
        .map((r) => ({ date: r.date, moisturePct: r.soil_moisture_avg! }));

      const speciesRow = await env.DB.prepare('SELECT ai_notes FROM species_reference WHERE species = ?').bind(tree.species).first<{ ai_notes: string | null }>();
      const conditions = await env.DB.prepare('SELECT outdoor_temp_c, humidity_pct FROM conditions_readings ORDER BY ts DESC LIMIT 1').first<ConditionsRow>();

      const readingAgeHours = (Date.now() - new Date(latestSoil.ts).getTime()) / (1000 * 60 * 60);

      const diagnosis = await diagnoseTreeSensorData(env, {
        treeName: tree.name,
        species: tree.species,
        speciesNotes: speciesRow?.ai_notes ?? undefined,
        developmentStage: tree.development_stage,
        latestSoil: { moisturePct: latestSoil.soil_moisture_pct, tempC: latestSoil.soil_temp_c, ec: latestSoil.soil_ec, ts: latestSoil.ts },
        readingAgeHours,
        thresholds: {
          moistureLow: tree.soil_moisture_threshold_low,
          moistureHigh: tree.soil_moisture_threshold_high,
          ecHigh: tree.ec_threshold_high,
          dormancySoilTempC: tree.dormancy_soil_temp_c,
        },
        dailyHistory,
        outdoorConditions: conditions?.outdoor_temp_c != null ? { tempC: conditions.outdoor_temp_c, humidityPct: conditions.humidity_pct } : undefined,
      });

      await env.DB.prepare(`INSERT INTO analyses (tree_id, kind, source, status, summary, detail, model) VALUES (?, 'sensor', 'scheduled', ?, ?, ?, ?)`)
        .bind(tree.id, diagnosis.status, diagnosis.summary, diagnosis.detail, 'claude-sonnet-5')
        .run();

      treesDiagnosed++;
    } catch (err) {
      errors.push(`${tree.id}: ${String(err)}`);
    }
  }

  return { treesDiagnosed, treesSkipped, errors };
}
