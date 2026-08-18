import { describe, it, expect } from 'vitest';
import { parseHmsTimeField } from './hmsSmoke';

describe('parseHmsTimeField', () => {
  it('parses "YYYYDDD HHMM" into a UTC ISO timestamp', () => {
    // Day 229 of 2026: 2026 is not a leap year, so day 229 = Aug 17.
    expect(parseHmsTimeField('2026229 0950')).toBe('2026-08-17T09:50:00.000Z');
  });

  it('parses day 1 of the year as Jan 1', () => {
    expect(parseHmsTimeField('2026001 0000')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns null for missing or malformed input rather than guessing', () => {
    expect(parseHmsTimeField(null)).toBeNull();
    expect(parseHmsTimeField(undefined)).toBeNull();
    expect(parseHmsTimeField('')).toBeNull();
    expect(parseHmsTimeField('not a time')).toBeNull();
    expect(parseHmsTimeField('2026-08-17')).toBeNull();
  });
});
