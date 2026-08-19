import { describe, it, expect } from 'vitest';
import { shouldRunDiagnostic } from './dailyDiagnostic';

const NOW = new Date('2026-08-17T13:00:00Z');
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('shouldRunDiagnostic', () => {
  it('runs for a brand-new anomaly with no prior diagnosis', () => {
    const result = shouldRunDiagnostic('urgent', null, NOW);
    expect(result.run).toBe(true);
    expect(result.reason).toBe('new anomaly');
  });

  it('runs every day while an anomaly remains active', () => {
    const result = shouldRunDiagnostic('watch', { status: 'watch', ts: daysAgo(1).toISOString() }, NOW);
    expect(result.run).toBe(true);
    expect(result.reason).toBe('anomaly active');
  });

  it('runs for a tree with no prior diagnosis even if currently ok', () => {
    const result = shouldRunDiagnostic('ok', null, NOW);
    expect(result.run).toBe(true);
    expect(result.reason).toBe('no prior diagnosis');
  });

  it('skips a stable tree diagnosed recently', () => {
    const result = shouldRunDiagnostic('ok', { status: 'ok', ts: daysAgo(2).toISOString() }, NOW);
    expect(result.run).toBe(false);
    expect(result.reason).toBe('stable, diagnosed recently');
  });

  it('runs a weekly summary once 7 days have passed for a stable tree', () => {
    const justUnder = shouldRunDiagnostic('ok', { status: 'ok', ts: daysAgo(6.9).toISOString() }, NOW);
    expect(justUnder.run).toBe(false);

    const atOrOver = shouldRunDiagnostic('ok', { status: 'ok', ts: daysAgo(7).toISOString() }, NOW);
    expect(atOrOver.run).toBe(true);
    expect(atOrOver.reason).toBe('weekly summary');
  });
});
