import { describe, it, expect } from 'vitest';
import { computeSunTimes, sunTimesLocal } from './suncalc';

// North Bend, WA (matches nws.ts's GROVE_LAT/GROVE_LON).
const LAT = 47.4776620;
const LON = -121.7300978;

describe('computeSunTimes', () => {
  it('places sunrise before solar noon and sunset after it', () => {
    const t = computeSunTimes(new Date('2026-08-12T20:00:00Z'), LAT, LON);
    expect(t.sunriseUtcMinutes).toBeLessThan(t.sunsetUtcMinutes);
    expect(t.dayLengthMinutes).toBeGreaterThan(0);
    expect(t.dayLengthMinutes).toBeCloseTo(t.sunsetUtcMinutes - t.sunriseUtcMinutes, 5);
  });

  it('gives longer days in summer than winter at this latitude', () => {
    const summer = computeSunTimes(new Date('2026-06-21T20:00:00Z'), LAT, LON);
    const winter = computeSunTimes(new Date('2026-12-21T20:00:00Z'), LAT, LON);
    expect(summer.dayLengthMinutes).toBeGreaterThan(winter.dayLengthMinutes);
  });
});

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

describe('sunTimesLocal', () => {
  // Regression anchor: this implementation was checked against Python's
  // `astral` library for North Bend, WA on 2026-08-12 before being trusted
  // (see the module-level comment in suncalc.ts) -- astral gave 05:59:49
  // sunrise / 20:23:34 sunset PDT, within the ~2-4 minute precision this
  // simplified algorithm targets. The exact minute shifts by the time of
  // day passed in (T, centuries-since-J2000, includes the time fraction),
  // so this checks the tolerance the code itself claims rather than
  // pinning one arbitrary timestamp's exact-minute output.
  it('stays within a few minutes of the astral-verified reference for North Bend, WA on 2026-08-12', () => {
    const t = sunTimesLocal(new Date('2026-08-12T20:00:00Z'), LAT, LON);
    expect(Math.abs(hhmmToMinutes(t.sunrise) - hhmmToMinutes('05:59'))).toBeLessThanOrEqual(5);
    expect(Math.abs(hhmmToMinutes(t.sunset) - hhmmToMinutes('20:23'))).toBeLessThanOrEqual(5);
    expect(t.dayLengthHours).toBeGreaterThan(14);
    expect(t.dayLengthHours).toBeLessThan(15);
  });

  it('returns times in HH:MM 24-hour format', () => {
    const t = sunTimesLocal(new Date('2026-03-01T20:00:00Z'), LAT, LON);
    expect(t.sunrise).toMatch(/^\d{2}:\d{2}$/);
    expect(t.sunset).toMatch(/^\d{2}:\d{2}$/);
  });
});
