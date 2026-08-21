import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './time';

const NOW = new Date('2026-08-19T12:00:00Z');

describe('formatRelativeTime', () => {
  it('reports "just now" for under a minute', () => {
    expect(formatRelativeTime('2026-08-19T11:59:30Z', NOW)).toBe('just now');
  });

  it('reports minutes for under an hour', () => {
    expect(formatRelativeTime('2026-08-19T11:45:00Z', NOW)).toBe('15m ago');
  });

  it('reports whole hours for under a day', () => {
    expect(formatRelativeTime('2026-08-19T09:00:00Z', NOW)).toBe('3h ago');
  });

  it('reports days and hours once past 24h', () => {
    expect(formatRelativeTime('2026-08-17T10:00:00Z', NOW)).toBe('2d 2h ago');
  });
});
