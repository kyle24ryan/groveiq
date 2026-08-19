import { describe, it, expect } from 'vitest';
import { computeEvidence, type EvidenceEngineInput, type RawSoilReading } from './evidenceEngine';

const BASE_TS = new Date('2026-08-17T12:00:00Z').getTime();
function ts(offsetMinutes: number): string {
  return new Date(BASE_TS + offsetMinutes * 60_000).toISOString();
}

function baseInput(overrides: Partial<EvidenceEngineInput> = {}): EvidenceEngineInput {
  return {
    now: new Date(ts(0)),
    thresholds: { moistureLow: 15, moistureHigh: 90, ecHigh: 2.5, dormancySoilTempC: 5 },
    latestSoil: { moisturePct: 20, tempC: 12, ec: 1, ts: ts(0) },
    recentSoilReadings: [],
    dailyHistory: [],
    recentConditions: [],
    ...overrides,
  };
}

describe('computeEvidence: watering event detection', () => {
  it('does not flag a 4.9-point rise within 30 minutes', () => {
    const readings: RawSoilReading[] = [
      { ts: ts(0), moisturePct: 20, tempC: 12, ec: 1 },
      { ts: ts(30), moisturePct: 24.9, tempC: 12, ec: 1 },
    ];
    const evidence = computeEvidence(baseInput({ now: new Date(ts(30)), latestSoil: { moisturePct: 24.9, tempC: 12, ec: 1, ts: ts(30) }, recentSoilReadings: readings }));
    expect(evidence.wateringEvents).toHaveLength(0);
  });

  it('flags a 5.0-point rise within 30 minutes as a watering event', () => {
    const readings: RawSoilReading[] = [
      { ts: ts(0), moisturePct: 20, tempC: 12, ec: 1 },
      { ts: ts(30), moisturePct: 25, tempC: 12, ec: 1 },
    ];
    const evidence = computeEvidence(baseInput({ now: new Date(ts(30)), latestSoil: { moisturePct: 25, tempC: 12, ec: 1, ts: ts(30) }, recentSoilReadings: readings }));
    expect(evidence.wateringEvents).toHaveLength(1);
    expect(evidence.wateringEvents[0].riseAmount).toBe(5);
    expect(evidence.wateringEvents[0].possiblyRain).toBe(false);
  });

  it('marks a detected event as possibly rain when conditions show rain in the same window', () => {
    const readings: RawSoilReading[] = [
      { ts: ts(0), moisturePct: 20, tempC: 12, ec: 1 },
      { ts: ts(30), moisturePct: 26, tempC: 12, ec: 1 },
    ];
    const conditions = [
      { ts: ts(0), tempC: 10, humidityPct: 80, windMph: 5, rainIn: 0.1, solarWm2: 0 },
      { ts: ts(30), tempC: 10, humidityPct: 85, windMph: 5, rainIn: 0.3, solarWm2: 0 },
    ];
    const evidence = computeEvidence(
      baseInput({ now: new Date(ts(30)), latestSoil: { moisturePct: 26, tempC: 12, ec: 1, ts: ts(30) }, recentSoilReadings: readings, recentConditions: conditions })
    );
    expect(evidence.wateringEvents[0].possiblyRain).toBe(true);
  });
});

describe('computeEvidence: dry-down slope', () => {
  it('computes a secant slope from the peak to the current reading', () => {
    const readings: RawSoilReading[] = [
      { ts: ts(0), moisturePct: 40, tempC: 12, ec: 1 },
      { ts: ts(24 * 60), moisturePct: 16, tempC: 12, ec: 1 },
    ];
    const evidence = computeEvidence(
      baseInput({ now: new Date(ts(24 * 60)), latestSoil: { moisturePct: 16, tempC: 12, ec: 1, ts: ts(24 * 60) }, recentSoilReadings: readings })
    );
    expect(evidence.dryDown).not.toBeNull();
    expect(evidence.dryDown?.peakValue).toBe(40);
    expect(evidence.dryDown?.slopePctPerHour).toBeCloseTo(1, 5);
  });
});

describe('computeEvidence: moisture change windows', () => {
  it('diffs the current reading against the closest reading to each window boundary', () => {
    const readings: RawSoilReading[] = [
      { ts: ts(-24 * 60), moisturePct: 30, tempC: 12, ec: 1 },
      { ts: ts(-12 * 60), moisturePct: 25, tempC: 12, ec: 1 },
      { ts: ts(-6 * 60), moisturePct: 22, tempC: 12, ec: 1 },
      { ts: ts(-60), moisturePct: 20, tempC: 12, ec: 1 },
      { ts: ts(0), moisturePct: 18, tempC: 12, ec: 1 },
    ];
    const evidence = computeEvidence(baseInput({ now: new Date(ts(0)), latestSoil: { moisturePct: 18, tempC: 12, ec: 1, ts: ts(0) }, recentSoilReadings: readings }));
    expect(evidence.moistureChange['1h']).toBe(-2);
    expect(evidence.moistureChange['6h']).toBe(-4);
    expect(evidence.moistureChange['12h']).toBe(-7);
    expect(evidence.moistureChange['24h']).toBe(-12);
  });

  it('returns null for a window with no reading close enough to the boundary', () => {
    const readings: RawSoilReading[] = [{ ts: ts(0), moisturePct: 18, tempC: 12, ec: 1 }];
    const evidence = computeEvidence(baseInput({ now: new Date(ts(0)), latestSoil: { moisturePct: 18, tempC: 12, ec: 1, ts: ts(0) }, recentSoilReadings: readings }));
    expect(evidence.moistureChange['24h']).toBeNull();
  });
});

describe('computeEvidence: sensor state classification', () => {
  it('classifies reporting, stale, and likely-offline by reading age', () => {
    const reporting = computeEvidence(baseInput({ now: new Date(ts(30)), latestSoil: { moisturePct: 20, tempC: 12, ec: 1, ts: ts(0) } }));
    expect(reporting.sensorState).toBe('reporting');

    const stale = computeEvidence(baseInput({ now: new Date(ts(120)), latestSoil: { moisturePct: 20, tempC: 12, ec: 1, ts: ts(0) } }));
    expect(stale.sensorState).toBe('stale');

    const offline = computeEvidence(baseInput({ now: new Date(ts(7 * 60)), latestSoil: { moisturePct: 20, tempC: 12, ec: 1, ts: ts(0) } }));
    expect(offline.sensorState).toBe('likely-offline');
  });
});

describe('computeEvidence: mirroredStatus parity with the frontend real-data engine', () => {
  // Hand-computed against the exact formulas ported from
  // frontend/src/data/realTreeAnalysis.ts's analyzeTreeReal() -- these
  // numbers are chosen so a divergence between the two copies of this math
  // would fail this test, not just look plausible.
  it('flags urgent when a fast decline projects below threshold within 1.5 days', () => {
    const evidence = computeEvidence(
      baseInput({
        latestSoil: { moisturePct: 12, tempC: 12, ec: 1, ts: ts(0) },
        thresholds: { moistureLow: 10, moistureHigh: 90, ecHigh: 2.5, dormancySoilTempC: 5 },
        dailyHistory: [
          { date: '2026-08-14', moistureAvg: 20, ecAvg: null },
          { date: '2026-08-15', moistureAvg: 19, ecAvg: null },
          { date: '2026-08-16', moistureAvg: 18, ecAvg: null },
          { date: '2026-08-17', moistureAvg: 12, ecAvg: null },
        ],
      })
    );
    const m = evidence.mirroredStatus;
    expect(m.hasEnoughHistoryForTrend).toBe(true);
    expect(m.changePct).toBe(-6);
    expect(m.typicalSwing).toBeCloseTo(8 / 3, 5);
    expect(m.decliningFast).toBe(true);
    expect(m.daysToThreshold).toBe(0.3);
    expect(m.status).toBe('urgent');
  });

  it('reports ok for a tree within range with no notable decline', () => {
    const evidence = computeEvidence(
      baseInput({
        latestSoil: { moisturePct: 25, tempC: 12, ec: 1, ts: ts(0) },
        thresholds: { moistureLow: 15, moistureHigh: 90, ecHigh: 2.5, dormancySoilTempC: 5 },
        dailyHistory: [
          { date: '2026-08-15', moistureAvg: 26, ecAvg: null },
          { date: '2026-08-16', moistureAvg: 25.5, ecAvg: null },
          { date: '2026-08-17', moistureAvg: 25, ecAvg: null },
        ],
      })
    );
    expect(evidence.mirroredStatus.status).toBe('ok');
    expect(evidence.mirroredStatus.decliningFast).toBe(false);
  });

  it('does not compute a trend below MIN_DAYS_FOR_TREND days of history', () => {
    const evidence = computeEvidence(
      baseInput({
        latestSoil: { moisturePct: 25, tempC: 12, ec: 1, ts: ts(0) },
        dailyHistory: [
          { date: '2026-08-16', moistureAvg: 30, ecAvg: null },
          { date: '2026-08-17', moistureAvg: 25, ecAvg: null },
        ],
      })
    );
    expect(evidence.mirroredStatus.hasEnoughHistoryForTrend).toBe(false);
    expect(evidence.mirroredStatus.decliningFast).toBe(false);
  });
});

describe('computeEvidence: EC anomaly', () => {
  it('flags exceeding the configured threshold and deviating from the 7-day baseline', () => {
    const evidence = computeEvidence(
      baseInput({
        latestSoil: { moisturePct: 20, tempC: 12, ec: 3.5, ts: ts(0) },
        thresholds: { moistureLow: 15, moistureHigh: 90, ecHigh: 2.5, dormancySoilTempC: 5 },
        dailyHistory: [
          { date: '2026-08-15', moistureAvg: 20, ecAvg: 2.0 },
          { date: '2026-08-16', moistureAvg: 20, ecAvg: 2.1 },
          { date: '2026-08-17', moistureAvg: 20, ecAvg: 2.2 },
        ],
      })
    );
    expect(evidence.ecAnomaly?.exceedsThreshold).toBe(true);
    expect(evidence.ecAnomaly?.deviatesFromBaseline).toBe(true);
  });

  it('is null when there is no current EC reading', () => {
    const evidence = computeEvidence(baseInput({ latestSoil: { moisturePct: 20, tempC: 12, ec: null, ts: ts(0) } }));
    expect(evidence.ecAnomaly).toBeNull();
  });
});
