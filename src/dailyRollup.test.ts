import { describe, it, expect } from 'vitest';
import { yesterdayGroveLocalDateStr } from './dailyRollup';

describe('yesterdayGroveLocalDateStr', () => {
  it('returns the previous calendar date under PDT (UTC-7)', () => {
    // 2026-08-18 05:00 UTC = 2026-08-17 22:00 PDT -- still the 17th locally.
    expect(yesterdayGroveLocalDateStr(new Date('2026-08-18T05:00:00Z'))).toBe('2026-08-16');
    // 2026-08-18 13:00 UTC (the actual cron time) = 2026-08-18 06:00 PDT --
    // today is the 18th locally, so yesterday is the 17th.
    expect(yesterdayGroveLocalDateStr(new Date('2026-08-18T13:00:00Z'))).toBe('2026-08-17');
  });

  it('returns the previous calendar date under PST (UTC-8)', () => {
    // 2026-01-15 13:00 UTC = 2026-01-15 05:00 PST -- today is the 15th
    // locally, yesterday is the 14th.
    expect(yesterdayGroveLocalDateStr(new Date('2026-01-15T13:00:00Z'))).toBe('2026-01-14');
  });

  it('handles a month boundary', () => {
    // 2026-09-01 13:00 UTC = 2026-09-01 06:00 PDT -- yesterday is Aug 31.
    expect(yesterdayGroveLocalDateStr(new Date('2026-09-01T13:00:00Z'))).toBe('2026-08-31');
  });
});
