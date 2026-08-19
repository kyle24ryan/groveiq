// Deterministic feature computation for the daily sensor diagnostic.
// Pure and synchronous -- all D1 querying stays in dailyDiagnostic.ts, this
// module only turns already-fetched rows into compact, labeled facts.
//
// `mirrorStatus` below is a backend-local port of the frontend's real
// status logic (frontend/src/data/realTreeAnalysis.ts's analyzeTreeReal):
// same MIN_DAYS_FOR_TREND, same decliningFast/daysToThreshold formulas.
// It's included in Evidence as a labeled fact for Claude to react to, and
// it does NOT overwrite analyses.status, which stays the model's own field
// exactly as before -- this keeps the existing "additive, not
// authoritative" contract for the sensor diagnostic unchanged. The two
// copies of this math (here and in the frontend) are kept in numeric
// lockstep by the parity tests in evidenceEngine.test.ts, not by a shared
// import, since the backend Worker and frontend bundle are separate
// packages (see src/claude.ts's MIN_DAYS_FOR_TREND comment for the same
// convention already in use for that one constant).
import { MIN_DAYS_FOR_TREND, STALE_READING_HOURS } from './claude';

const LIKELY_OFFLINE_HOURS = 6;
const WATERING_RISE_THRESHOLD_PCT = 5;
const WATERING_WINDOW_MS = 30 * 60 * 1000;
const EC_BASELINE_DEVIATION_RATIO = 0.3;
const RAIN_DELTA_IN = 0.01;
const MOISTURE_CHANGE_WINDOWS_HOURS = [1, 6, 12, 24] as const;
const MOISTURE_CHANGE_TOLERANCE_HOURS = 2;

export type RawSoilReading = { ts: string; moisturePct: number | null; tempC: number | null; ec: number | null };
export type RawConditionsReading = {
  ts: string;
  tempC: number | null;
  humidityPct: number | null;
  windMph: number | null;
  rainIn: number | null;
  solarWm2: number | null;
};

export type EvidenceEngineInput = {
  now: Date;
  thresholds: { moistureLow: number; moistureHigh: number; ecHigh: number; dormancySoilTempC: number };
  // Caller guarantees this exists (dailyDiagnostic.ts skips a tree entirely
  // when it has no soil reading at all) -- never null here.
  latestSoil: { moisturePct: number; tempC: number | null; ec: number | null; ts: string };
  // Ascending (oldest first), ~last 24-48h of raw soil_readings for this tree.
  recentSoilReadings: RawSoilReading[];
  // Oldest first, up to 14 days. Entries with a null moistureAvg already
  // filtered out by the caller, same convention dailyDiagnostic.ts already
  // used before this module existed.
  dailyHistory: { date: string; moistureAvg: number; ecAvg: number | null }[];
  // Ascending, ~last 24h of grove-wide conditions_readings (shared across
  // trees -- not per-tree).
  recentConditions: RawConditionsReading[];
  // Same-species sibling tree, if one exists (e.g. the two Yellow Cedars).
  companion?: { treeId: string; latestSoil: { moisturePct: number | null; ts: string } | null };
};

export type WateringEvent = { startTs: string; endTs: string; riseAmount: number; possiblyRain: boolean };

export type DryDown = { peakValue: number; peakTs: string; slopePctPerHour: number };

export type MirroredStatus = {
  status: 'ok' | 'watch' | 'urgent';
  belowThreshold: boolean;
  aboveThreshold: boolean;
  decliningFast: boolean;
  changePct: number;
  typicalSwing: number;
  daysToThreshold: number | null;
  hasEnoughHistoryForTrend: boolean;
};

export type Evidence = {
  currentMoisturePct: number;
  readingAgeHours: number;
  sensorState: 'reporting' | 'stale' | 'likely-offline';
  daysOfHistory: number;
  timeBelowLowThresholdHours: number;
  timeAboveHighThresholdHours: number;
  moistureChange: { '1h': number | null; '6h': number | null; '12h': number | null; '24h': number | null };
  wateringEvents: WateringEvent[];
  dryDown: DryDown | null;
  ecAnomaly: { current: number; thresholdHigh: number; sevenDayAvg: number | null; exceedsThreshold: boolean; deviatesFromBaseline: boolean } | null;
  tempAnomaly: { current: number; dormancyTriggerC: number; belowDormancyTrigger: boolean } | null;
  weather24h: { windMaxMph: number | null; rainTotalIn: number | null; humidityAvgPct: number | null; solarAvgWm2: number | null };
  ownBaseline: { trailing14dAvgPct: number | null; currentVsBaselineDeltaPct: number | null };
  companionComparison: { treeId: string; companionMoisturePct: number | null; deltaPct: number | null } | null;
  // Only covers things not already surfaced via claude.ts's stalenessNote/
  // trendNote (staleness and thin-history are derived from readingAgeHours/
  // daysOfHistory above, not duplicated here) -- this is specifically about
  // gaps in the raw reading cadence itself.
  sensorQualityWarnings: string[];
  mirroredStatus: MirroredStatus;
};

function hoursBetween(tsA: string, tsB: string): number {
  return (new Date(tsB).getTime() - new Date(tsA).getTime()) / (1000 * 60 * 60);
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function classifySensorState(readingAgeHours: number): Evidence['sensorState'] {
  if (readingAgeHours > LIKELY_OFFLINE_HOURS) return 'likely-offline';
  if (readingAgeHours > STALE_READING_HOURS) return 'stale';
  return 'reporting';
}

function computeTimeBelowAboveThreshold(
  readings: RawSoilReading[],
  thresholds: { moistureLow: number; moistureHigh: number },
  now: Date
): { belowHours: number; aboveHours: number } {
  const windowStart = now.getTime() - 24 * 60 * 60 * 1000;
  let belowHours = 0;
  let aboveHours = 0;

  for (let i = 0; i < readings.length - 1; i++) {
    const a = readings[i];
    const b = readings[i + 1];
    if (a.moisturePct == null) continue;
    const aTime = new Date(a.ts).getTime();
    const bTime = new Date(b.ts).getTime();
    if (bTime <= windowStart) continue;
    const intervalHours = hoursBetween(a.ts, b.ts);
    if (intervalHours <= 0) continue;
    // Clip the interval to the last 24h if it starts before the window.
    const clippedHours = aTime < windowStart ? hoursBetween(new Date(windowStart).toISOString(), b.ts) : intervalHours;
    if (a.moisturePct < thresholds.moistureLow) belowHours += clippedHours;
    else if (a.moisturePct > thresholds.moistureHigh) aboveHours += clippedHours;
  }

  return { belowHours: Math.round(belowHours * 10) / 10, aboveHours: Math.round(aboveHours * 10) / 10 };
}

function computeMoistureChange(readings: RawSoilReading[], currentMoisture: number, now: Date): Evidence['moistureChange'] {
  const result: Evidence['moistureChange'] = { '1h': null, '6h': null, '12h': null, '24h': null };
  const withValues = readings.filter((r): r is RawSoilReading & { moisturePct: number } => r.moisturePct != null);

  for (const windowHours of MOISTURE_CHANGE_WINDOWS_HOURS) {
    const targetTime = now.getTime() - windowHours * 60 * 60 * 1000;
    let closest: (RawSoilReading & { moisturePct: number }) | null = null;
    let closestDiffMs = Infinity;
    for (const r of withValues) {
      const diff = Math.abs(new Date(r.ts).getTime() - targetTime);
      if (diff < closestDiffMs) {
        closestDiffMs = diff;
        closest = r;
      }
    }
    if (closest && closestDiffMs <= MOISTURE_CHANGE_TOLERANCE_HOURS * 60 * 60 * 1000) {
      result[`${windowHours}h` as keyof Evidence['moistureChange']] = Math.round((currentMoisture - closest.moisturePct) * 10) / 10;
    }
  }

  return result;
}

function hasRainInWindow(conditions: RawConditionsReading[], startTs: string, endTs: string): boolean {
  const startMs = new Date(startTs).getTime();
  const endMs = new Date(endTs).getTime();
  const inWindow = conditions.filter((c) => {
    const t = new Date(c.ts).getTime();
    return t >= startMs && t <= endMs && c.rainIn != null;
  });
  if (inWindow.length < 2) return false;
  const values = inWindow.map((c) => c.rainIn!);
  return Math.max(...values) - Math.min(...values) > RAIN_DELTA_IN;
}

function detectWateringEvents(readings: RawSoilReading[], conditions: RawConditionsReading[]): WateringEvent[] {
  const events: WateringEvent[] = [];
  let i = 0;

  while (i < readings.length) {
    const start = readings[i];
    if (start.moisturePct == null) {
      i++;
      continue;
    }
    const startTime = new Date(start.ts).getTime();
    let maxRise = 0;
    let peakIdx = -1;
    let j = i + 1;
    while (j < readings.length && new Date(readings[j].ts).getTime() - startTime <= WATERING_WINDOW_MS) {
      if (readings[j].moisturePct != null) {
        const rise = readings[j].moisturePct! - start.moisturePct;
        if (rise > maxRise) {
          maxRise = rise;
          peakIdx = j;
        }
      }
      j++;
    }

    if (maxRise >= WATERING_RISE_THRESHOLD_PCT && peakIdx !== -1) {
      const peak = readings[peakIdx];
      events.push({
        startTs: start.ts,
        endTs: peak.ts,
        riseAmount: Math.round(maxRise * 10) / 10,
        possiblyRain: hasRainInWindow(conditions, start.ts, peak.ts),
      });
      i = peakIdx + 1;
    } else {
      i++;
    }
  }

  return events;
}

function computeDryDown(readings: RawSoilReading[], events: WateringEvent[]): DryDown | null {
  const withValues = readings.filter((r): r is RawSoilReading & { moisturePct: number } => r.moisturePct != null);
  if (withValues.length === 0) return null;
  const current = withValues[withValues.length - 1];

  let peak: { ts: string; value: number } | null = null;
  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    const peakReading = withValues.find((r) => r.ts === lastEvent.endTs);
    if (peakReading) peak = { ts: peakReading.ts, value: peakReading.moisturePct };
  }
  if (!peak) {
    const localMax = withValues.reduce((a, b) => (b.moisturePct > a.moisturePct ? b : a));
    peak = { ts: localMax.ts, value: localMax.moisturePct };
  }

  const hoursSincePeak = hoursBetween(peak.ts, current.ts);
  if (hoursSincePeak <= 0) return null;

  const slope = (peak.value - current.moisturePct) / hoursSincePeak;
  return { peakValue: peak.value, peakTs: peak.ts, slopePctPerHour: Math.round(slope * 100) / 100 };
}

function computeEcAnomaly(latestEc: number | null, ecThresholdHigh: number, dailyHistory: { ecAvg: number | null }[]): Evidence['ecAnomaly'] {
  if (latestEc == null) return null;
  const recentEc = dailyHistory
    .slice(-7)
    .map((d) => d.ecAvg)
    .filter((v): v is number => v != null);
  const sevenDayAvg = recentEc.length > 0 ? average(recentEc) : null;
  const exceedsThreshold = latestEc > ecThresholdHigh;
  const deviatesFromBaseline = sevenDayAvg != null && sevenDayAvg > 0 && Math.abs(latestEc - sevenDayAvg) / sevenDayAvg > EC_BASELINE_DEVIATION_RATIO;
  return { current: latestEc, thresholdHigh: ecThresholdHigh, sevenDayAvg, exceedsThreshold, deviatesFromBaseline };
}

function computeTempAnomaly(latestTempC: number | null, dormancySoilTempC: number): Evidence['tempAnomaly'] {
  if (latestTempC == null) return null;
  return { current: latestTempC, dormancyTriggerC: dormancySoilTempC, belowDormancyTrigger: latestTempC < dormancySoilTempC };
}

function aggregateWeather24h(conditions: RawConditionsReading[]): Evidence['weather24h'] {
  const wind = conditions.map((c) => c.windMph).filter((v): v is number => v != null);
  const rain = conditions.map((c) => c.rainIn).filter((v): v is number => v != null);
  const humidity = conditions.map((c) => c.humidityPct).filter((v): v is number => v != null);
  const solar = conditions.map((c) => c.solarWm2).filter((v): v is number => v != null);
  return {
    windMaxMph: wind.length > 0 ? Math.max(...wind) : null,
    // Ecowitt's rain_in is a cumulative daily counter, not a rate -- take
    // the max snapshot in-window rather than summing, same convention as
    // dailyRollup.ts's rain_total.
    rainTotalIn: rain.length > 0 ? Math.max(...rain) : null,
    humidityAvgPct: humidity.length > 0 ? Math.round(average(humidity) * 10) / 10 : null,
    solarAvgWm2: solar.length > 0 ? Math.round(average(solar) * 10) / 10 : null,
  };
}

function computeOwnBaseline(dailyHistory: { moistureAvg: number }[], currentMoisture: number): Evidence['ownBaseline'] {
  const trailing = dailyHistory.slice(-14).map((d) => d.moistureAvg);
  const trailing14dAvgPct = trailing.length > 0 ? Math.round(average(trailing) * 10) / 10 : null;
  const currentVsBaselineDeltaPct = trailing14dAvgPct != null ? Math.round((currentMoisture - trailing14dAvgPct) * 10) / 10 : null;
  return { trailing14dAvgPct, currentVsBaselineDeltaPct };
}

function computeCompanionComparison(companion: EvidenceEngineInput['companion'], currentMoisture: number): Evidence['companionComparison'] {
  if (!companion) return null;
  const companionMoisturePct = companion.latestSoil?.moisturePct ?? null;
  const deltaPct = companionMoisturePct != null ? Math.round((currentMoisture - companionMoisturePct) * 10) / 10 : null;
  return { treeId: companion.treeId, companionMoisturePct, deltaPct };
}

function computeSensorQualityWarnings(readings: RawSoilReading[]): string[] {
  const warnings: string[] = [];
  const withValues = readings.filter((r) => r.moisturePct != null);
  let maxGapMinutes = 0;
  for (let i = 1; i < withValues.length; i++) {
    const gapMinutes = hoursBetween(withValues[i - 1].ts, withValues[i].ts) * 60;
    if (gapMinutes > maxGapMinutes) maxGapMinutes = gapMinutes;
  }
  if (maxGapMinutes > 30) {
    warnings.push(`Sensor reporting gaps up to ${Math.round(maxGapMinutes)} minutes detected in the recent window (expected ~5-minute cadence).`);
  }
  return warnings;
}

// Backend-local mirror of frontend/src/data/realTreeAnalysis.ts's
// analyzeTreeReal() status math. See module-level comment for why this is
// a mirror, not an import, and evidenceEngine.test.ts for the parity tests
// keeping the two in numeric lockstep.
function mirrorStatus(
  currentMoisture: number,
  dailyHistory: { moistureAvg: number }[],
  thresholds: { moistureLow: number; moistureHigh: number }
): MirroredStatus {
  const daysOfHistory = dailyHistory.length;
  const hasEnoughHistoryForTrend = daysOfHistory >= MIN_DAYS_FOR_TREND;
  const belowThreshold = currentMoisture < thresholds.moistureLow;
  const aboveThreshold = currentMoisture > thresholds.moistureHigh;

  let changePct = 0;
  let typicalSwing = 0;
  let decliningFast = false;
  let daysToThreshold: number | null = null;

  if (hasEnoughHistoryForTrend) {
    const ordered = dailyHistory.slice(-MIN_DAYS_FOR_TREND - 11);
    const last = ordered[ordered.length - 1];
    const prev = ordered[ordered.length - 2];
    changePct = Math.round((last.moistureAvg - prev.moistureAvg) * 10) / 10;

    const dayChanges: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      dayChanges.push(Math.abs(ordered[i].moistureAvg - ordered[i - 1].moistureAvg));
    }
    typicalSwing = dayChanges.length > 0 ? average(dayChanges) : 0;
    decliningFast = changePct < 0 && Math.abs(changePct) > Math.max(typicalSwing * 2, 3);
  }

  let status: MirroredStatus['status'] = 'ok';
  if (belowThreshold) {
    status = 'urgent';
  } else if (decliningFast) {
    const bufferPct = currentMoisture - thresholds.moistureLow;
    daysToThreshold = Math.round((bufferPct / Math.abs(changePct)) * 10) / 10;
    status = daysToThreshold < 1.5 ? 'urgent' : 'watch';
  } else if (aboveThreshold) {
    status = 'watch';
  }

  return { status, belowThreshold, aboveThreshold, decliningFast, changePct, typicalSwing, daysToThreshold, hasEnoughHistoryForTrend };
}

export function computeEvidence(input: EvidenceEngineInput): Evidence {
  const { now, thresholds, latestSoil, recentSoilReadings, dailyHistory, recentConditions, companion } = input;
  const readingAgeHours = hoursBetween(latestSoil.ts, now.toISOString());
  const sensorState = classifySensorState(readingAgeHours);
  const { belowHours, aboveHours } = computeTimeBelowAboveThreshold(recentSoilReadings, thresholds, now);
  const wateringEvents = detectWateringEvents(recentSoilReadings, recentConditions);

  return {
    currentMoisturePct: latestSoil.moisturePct,
    readingAgeHours: Math.round(readingAgeHours * 100) / 100,
    sensorState,
    daysOfHistory: dailyHistory.length,
    timeBelowLowThresholdHours: belowHours,
    timeAboveHighThresholdHours: aboveHours,
    moistureChange: computeMoistureChange(recentSoilReadings, latestSoil.moisturePct, now),
    wateringEvents,
    dryDown: computeDryDown(recentSoilReadings, wateringEvents),
    ecAnomaly: computeEcAnomaly(latestSoil.ec, thresholds.ecHigh, dailyHistory),
    tempAnomaly: computeTempAnomaly(latestSoil.tempC, thresholds.dormancySoilTempC),
    weather24h: aggregateWeather24h(recentConditions),
    ownBaseline: computeOwnBaseline(dailyHistory, latestSoil.moisturePct),
    companionComparison: computeCompanionComparison(companion, latestSoil.moisturePct),
    sensorQualityWarnings: computeSensorQualityWarnings(recentSoilReadings),
    mirroredStatus: mirrorStatus(latestSoil.moisturePct, dailyHistory, thresholds),
  };
}
