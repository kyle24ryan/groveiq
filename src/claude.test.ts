import { describe, it, expect } from 'vitest';
import { stalenessNote, trendNote, MIN_DAYS_FOR_TREND } from './claude';

describe('stalenessNote', () => {
  it('is empty for a fresh reading', () => {
    expect(stalenessNote(0.5)).toBe('');
    expect(stalenessNote(1)).toBe('');
  });

  it('warns once a reading is over an hour old', () => {
    expect(stalenessNote(1.1)).toContain('1.1 hours old');
    expect(stalenessNote(6)).toContain('6.0 hours old');
  });
});

describe('trendNote', () => {
  it('blocks a trend claim below the minimum-history threshold', () => {
    expect(trendNote(0)).toContain('do not claim a trend');
    expect(trendNote(MIN_DAYS_FOR_TREND - 1)).toContain('do not claim a trend');
  });

  it('is empty once enough history exists', () => {
    expect(trendNote(MIN_DAYS_FOR_TREND)).toBe('');
    expect(trendNote(MIN_DAYS_FOR_TREND + 10)).toBe('');
  });
});
