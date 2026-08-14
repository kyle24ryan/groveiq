import { describe, it, expect } from 'vitest';
import { freshnessLabel } from './api';

describe('freshnessLabel', () => {
  it('reports no data when there is no timestamp', () => {
    const r = freshnessLabel(null);
    expect(r.stale).toBe(true);
    expect(r.label).toBe('No data yet');
  });

  it('reports live and fresh for a timestamp just now', () => {
    const r = freshnessLabel(new Date().toISOString());
    expect(r.stale).toBe(false);
    expect(r.label).toContain('Live');
  });

  it('reports stale once a reading is older than the 15-minute threshold', () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(freshnessLabel(old).stale).toBe(true);
  });

  it('stays fresh just under the threshold', () => {
    const recent = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(freshnessLabel(recent).stale).toBe(false);
  });
});
