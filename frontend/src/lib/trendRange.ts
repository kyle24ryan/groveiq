import type { TrendRange } from '../data/types';

// The 'hour' range pulls raw sensor readings over this window (5-min
// cadence, hourly-scale resolution); the rest pull the daily_readings
// rollup over progressively wider windows via daysForRange below.
export const HOUR_RANGE_WINDOW_HOURS = 24;

export function daysForRange(range: TrendRange): number {
  switch (range) {
    case 'week':
      return 7;
    case 'month':
      return 30;
    case 'year':
      return 365;
    default:
      return 30;
  }
}

export function formatXForRange(range: TrendRange): (v: string) => string {
  if (range === 'hour') {
    return (v: string) => new Date(v).toLocaleTimeString(undefined, { hour: 'numeric' });
  }
  if (range === 'year') {
    return (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  return (v: string) => v.slice(5); // MM-DD
}

export function emptyMessageForRange(range: TrendRange, sinceLabel = 'real soil sensors went live 2026-08-18'): string {
  if (range === 'hour') return `No readings in the last 24 hours yet.`;
  return `Not enough history yet for this range -- ${sinceLabel}. This fills in as data accumulates.`;
}
