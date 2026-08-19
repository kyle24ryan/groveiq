import { describe, it, expect } from 'vitest';
import { stalenessNote, trendNote, MIN_DAYS_FOR_TREND, isValidDiagnosisShape } from './claude';

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

describe('isValidDiagnosisShape', () => {
  const valid = { status: 'watch', confidence: 'medium', summary: 'A summary.', detail: 'Some detail.' };

  it('accepts a well-formed diagnosis', () => {
    expect(isValidDiagnosisShape(valid)).toBe(true);
  });

  it('rejects an invalid or missing status', () => {
    expect(isValidDiagnosisShape({ ...valid, status: 'critical' })).toBe(false);
    expect(isValidDiagnosisShape({ ...valid, status: undefined })).toBe(false);
  });

  it('rejects an invalid or missing confidence', () => {
    expect(isValidDiagnosisShape({ ...valid, confidence: 'certain' })).toBe(false);
    expect(isValidDiagnosisShape({ ...valid, confidence: undefined })).toBe(false);
  });

  it('rejects missing summary or detail', () => {
    expect(isValidDiagnosisShape({ ...valid, summary: '' })).toBe(false);
    expect(isValidDiagnosisShape({ ...valid, detail: '' })).toBe(false);
  });

  it('rejects null and non-object input', () => {
    expect(isValidDiagnosisShape(null)).toBe(false);
    expect(isValidDiagnosisShape(undefined)).toBe(false);
    expect(isValidDiagnosisShape('not an object')).toBe(false);
  });
});
