// Real-data replacement for mockData.ts's analyzeTree()/insightFor().
// Same output shapes (TreeAnalysis, Insight) so every consuming component
// (TreeCard, InsightPanel, CollectionStatusMatrix, NextRiskPanel, Timeline,
// Insights, TreeCompare) works unmodified -- only the data source and the
// logic computing these values change.
//
// Real soil sensors went live 2026-08-18, so daily_readings history is
// necessarily thin for a while. Unlike the mock engine (which always has
// 30 fabricated days to work with), this must be honest when there isn't
// enough real history to support a trend claim, rather than computing one
// from 1-2 data points and presenting it with the same confidence as a
// real 14-day baseline would deserve. No driver/cause is invented either
// -- mockData.ts's insightFor() picks a random "likely cause" from a fixed
// list, which is exactly the kind of fabricated-correlation language this
// project avoids elsewhere (see EnvironmentalContextPanel.tsx, firms.ts).
// Real cause attribution needs actual correlated data across trees/
// conditions and is out of scope here.
import type { Tree, DailyReading, Insight, EvidencePoint, Status } from './types';
import type { TreeAnalysis } from './mockData';
import type { SoilReading, DailyReadingRow } from '../lib/api';

// Minimum days of real daily_readings before a trend (change rate, typical
// swing, days-to-threshold) is computed at all. Below this, only the
// current-level threshold check applies -- no trend claim, honest about
// why.
const MIN_DAYS_FOR_TREND = 3;

function toDailyReading(row: DailyReadingRow): DailyReading {
  return {
    date: row.date,
    soilMoistureAvg: row.soil_moisture_avg ?? 0,
    soilMoistureMin: row.soil_moisture_min ?? row.soil_moisture_avg ?? 0,
    soilMoistureMax: row.soil_moisture_max ?? row.soil_moisture_avg ?? 0,
    soilTempAvg: row.soil_temp_avg ?? 0,
    soilEcAvg: row.soil_ec_avg ?? 0,
  };
}

export function dailyReadingsFromRows(rows: DailyReadingRow[]): DailyReading[] {
  return rows.filter((r) => r.soil_moisture_avg != null).map(toDailyReading);
}

// Extends TreeAnalysis with an explicit flag for whether there was enough
// real history to support the trend fields at all, so insightForReal can
// tell "stable" apart from "not enough data to know yet."
export type RealTreeAnalysis = TreeAnalysis & {
  hasCurrentReading: boolean;
  hasEnoughHistoryForTrend: boolean;
  daysOfHistory: number;
};

export function analyzeTreeReal(tree: Tree, latestSoil: SoilReading | null, dailyHistory: DailyReading[]): RealTreeAnalysis {
  const hasCurrentReading = latestSoil?.soil_moisture_pct != null;
  const currentMoisture = latestSoil?.soil_moisture_pct ?? null;

  // "latest" for the shared TreeAnalysis/Insight shape -- built from the
  // live current reading when we have one (freshest truth), falling back
  // to the most recent daily rollup otherwise.
  const latest: DailyReading = hasCurrentReading
    ? {
        date: latestSoil!.ts.slice(0, 10),
        soilMoistureAvg: currentMoisture!,
        soilMoistureMin: currentMoisture!,
        soilMoistureMax: currentMoisture!,
        soilTempAvg: latestSoil!.soil_temp_c ?? 0,
        soilEcAvg: latestSoil!.soil_ec ?? 0,
      }
    : (dailyHistory[dailyHistory.length - 1] ?? { date: '', soilMoistureAvg: 0, soilMoistureMin: 0, soilMoistureMax: 0, soilTempAvg: 0, soilEcAvg: 0 });

  const daysOfHistory = dailyHistory.length;
  const hasEnoughHistoryForTrend = daysOfHistory >= MIN_DAYS_FOR_TREND;

  const belowThreshold = hasCurrentReading && currentMoisture! < tree.soilMoistureThresholdLow;
  const aboveThreshold = hasCurrentReading && currentMoisture! > tree.soilMoistureThresholdHigh;

  let changePct = 0;
  let typicalSwing = 0;
  let decliningFast = false;
  let daysToThreshold: number | null = null;

  if (hasEnoughHistoryForTrend) {
    const ordered = dailyHistory.slice(-MIN_DAYS_FOR_TREND - 11); // up to a 14-day trailing window
    const last = ordered[ordered.length - 1];
    const prev = ordered[ordered.length - 2];
    changePct = Math.round((last.soilMoistureAvg - prev.soilMoistureAvg) * 10) / 10;

    const dayChanges: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      dayChanges.push(Math.abs(ordered[i].soilMoistureAvg - ordered[i - 1].soilMoistureAvg));
    }
    typicalSwing = dayChanges.length > 0 ? dayChanges.reduce((s, d) => s + d, 0) / dayChanges.length : 0;

    decliningFast = changePct < 0 && Math.abs(changePct) > Math.max(typicalSwing * 2, 3);
  }

  let status: Status = 'ok';
  if (belowThreshold) {
    status = 'urgent';
  } else if (decliningFast && hasCurrentReading) {
    const bufferPct = currentMoisture! - tree.soilMoistureThresholdLow;
    daysToThreshold = Math.round((bufferPct / Math.abs(changePct)) * 10) / 10;
    status = daysToThreshold < 1.5 ? 'urgent' : 'watch';
  } else if (aboveThreshold) {
    status = 'watch';
  } else if (!hasCurrentReading) {
    // No live reading at all (sensor offline, or this tree's channel not
    // yet confirmed in soilChannels.ts) is itself worth surfacing, not a
    // silent "ok."
    status = 'watch';
  }

  return {
    tree,
    latest,
    changePct,
    typicalSwing,
    status,
    belowThreshold,
    aboveThreshold,
    decliningFast,
    daysToThreshold,
    hasCurrentReading,
    hasEnoughHistoryForTrend,
    daysOfHistory,
  };
}

function buildEvidenceSeriesReal(a: RealTreeAnalysis, dailyHistory: DailyReading[]): EvidencePoint[] {
  const recent = dailyHistory.slice(-10);
  const points: EvidencePoint[] = recent.map((r) => ({ date: r.date, observed: r.soilMoistureAvg }));

  if (a.decliningFast && a.changePct < 0 && points.length > 0) {
    const projectionDays = Math.min(Math.ceil(a.daysToThreshold ?? 4), 5);
    const lastDate = new Date(`${a.latest.date}T00:00:00`);
    points[points.length - 1] = { ...points[points.length - 1], projected: a.latest.soilMoistureAvg };
    for (let i = 1; i <= projectionDays; i++) {
      const date = new Date(lastDate);
      date.setDate(date.getDate() + i);
      const value = Math.max(0, Math.round((a.latest.soilMoistureAvg + a.changePct * i) * 10) / 10);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      points.push({ date: `${y}-${m}-${d}`, projected: value });
    }
  }

  return points;
}

export function insightForReal(a: RealTreeAnalysis, dailyHistory: DailyReading[]): Insight {
  const treeId = a.tree.id;
  let title: string;
  let headline: string;
  let evidence: string;
  let comparison: string | undefined;
  let implication: string | undefined;
  let action: string | undefined;
  let thresholdValue: number | undefined;
  let thresholdLabel: string | undefined;

  if (!a.hasCurrentReading) {
    title = 'GroveIQ: no current soil reading.';
    headline = `${a.tree.name} has no recent soil sensor data`;
    evidence = 'The soil sensor for this tree has not reported a reading recently -- check that it has power and is within range of the gateway.';
  } else if (a.belowThreshold) {
    title = 'GroveIQ: soil moisture below threshold.';
    headline = `${a.tree.name} is below its soil moisture threshold`;
    evidence = `Soil moisture at ${a.latest.soilMoistureAvg}%, below its ${a.tree.soilMoistureThresholdLow}% threshold.`;
    action = 'Water today and recheck this evening.';
    thresholdValue = a.tree.soilMoistureThresholdLow;
    thresholdLabel = 'Moisture threshold';
  } else if (a.decliningFast) {
    const ratio = a.typicalSwing < 1 ? null : Math.min(Math.abs(a.changePct) / a.typicalSwing, 9);
    title = 'GroveIQ detected an abnormal drying rate.';
    headline = ratio !== null ? `${a.tree.name} is drying ${ratio.toFixed(1)}x faster than its recent baseline` : `${a.tree.name} is drying faster than its recent baseline`;
    evidence = `Soil moisture is currently within its preferred range at ${a.latest.soilMoistureAvg}%, but changed ${Math.abs(a.changePct)} percentage points since the prior day (based on ${a.daysOfHistory} days of real history).`;
    comparison = ratio !== null ? `about ${ratio.toFixed(1)}x its typical day-to-day change over this short window` : 'a larger move than its recent typical change';
    implication =
      a.daysToThreshold !== null
        ? `Projected to cross its threshold in about ${a.daysToThreshold} day${a.daysToThreshold === 1 ? '' : 's'} at this rate -- treat as a rough estimate, not a confident multi-week trend, given only ${a.daysOfHistory} days of history so far.`
        : undefined;
    action = a.status === 'urgent' ? 'Water today and recheck this evening.' : 'Recheck tomorrow and plan to water within 1-2 days.';
    thresholdValue = a.tree.soilMoistureThresholdLow;
    thresholdLabel = 'Moisture threshold';
  } else if (a.aboveThreshold) {
    title = 'GroveIQ: soil moisture above preferred range.';
    headline = `${a.tree.name}'s soil moisture is above its preferred range`;
    evidence = `Soil moisture at ${a.latest.soilMoistureAvg}%, above its ${a.tree.soilMoistureThresholdHigh}% threshold.`;
    action = 'Hold off watering and check drainage.';
    thresholdValue = a.tree.soilMoistureThresholdHigh;
    thresholdLabel = 'Moisture threshold';
  } else if (!a.hasEnoughHistoryForTrend) {
    title = 'GroveIQ: gathering history.';
    headline = `${a.tree.name} is within range -- still gathering history`;
    evidence = `Soil moisture at ${a.latest.soilMoistureAvg}%, within its ${a.tree.soilMoistureThresholdLow}-${a.tree.soilMoistureThresholdHigh}% preferred range. Only ${a.daysOfHistory} day${a.daysOfHistory === 1 ? '' : 's'} of real history so far -- not enough yet to detect a meaningful trend (needs ${MIN_DAYS_FOR_TREND}+ days).`;
  } else {
    title = 'GroveIQ: conditions are stable.';
    headline = `${a.tree.name} is stable`;
    evidence = `Soil moisture at ${a.latest.soilMoistureAvg}%, within its ${a.tree.soilMoistureThresholdLow}-${a.tree.soilMoistureThresholdHigh}% preferred range.`;
  }

  return {
    id: `${treeId}-insight`,
    treeId,
    status: a.status,
    title,
    headline,
    evidence,
    comparison,
    implication,
    action,
    ts: new Date().toISOString(),
    detection: a.hasCurrentReading
      ? { metric: 'Soil moisture', currentValue: a.latest.soilMoistureAvg, unit: '%', changeWindow: a.hasEnoughHistoryForTrend ? 'day-over-day' : undefined }
      : undefined,
    // No `driver` field -- real cause attribution isn't built yet (see
    // module comment). Leaving it undefined is the honest state, not a
    // random guess from a fixed list.
    daysToThreshold: a.daysToThreshold,
    thresholdValue,
    thresholdLabel,
    evidenceSeries: a.status !== 'ok' && dailyHistory.length > 0 ? buildEvidenceSeriesReal(a, dailyHistory) : undefined,
  };
}
