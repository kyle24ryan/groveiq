import { describe, it, expect } from 'vitest';
import { daysForRange, formatXForRange } from './trendRange';

describe('daysForRange', () => {
  it('maps each preset to its window in days', () => {
    expect(daysForRange('week')).toBe(7);
    expect(daysForRange('month')).toBe(30);
    expect(daysForRange('year')).toBe(365);
  });
});

describe('formatXForRange', () => {
  it('formats an hour-range tick as a time', () => {
    const fmt = formatXForRange('hour');
    expect(fmt('2026-08-19T14:30:00Z')).not.toContain('2026');
  });

  it('formats a month-range tick as MM-DD', () => {
    expect(formatXForRange('month')('2026-08-19')).toBe('08-19');
  });

  it('formats a year-range tick with the year', () => {
    const fmt = formatXForRange('year');
    expect(fmt('2026-08-19')).toContain('26');
  });
});
