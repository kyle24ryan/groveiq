import { describe, it, expect } from 'vitest';
import { distanceKm, bearingDeg, compassLabel } from './geo';

describe('distanceKm', () => {
  it('returns 0 for the same point', () => {
    expect(distanceKm(47.5, -121.7, 47.5, -121.7)).toBeCloseTo(0, 5);
  });

  it('matches a known reference distance (Seattle to Portland, ~233km great-circle)', () => {
    const d = distanceKm(47.6062, -122.3321, 45.5152, -122.6784);
    expect(d).toBeGreaterThan(225);
    expect(d).toBeLessThan(240);
  });
});

describe('bearingDeg', () => {
  it('reports due north as 0', () => {
    expect(bearingDeg(47, -122, 48, -122)).toBeCloseTo(0, 0);
  });

  it('reports due east as ~90', () => {
    const b = bearingDeg(47, -122, 47, -121);
    expect(b).toBeGreaterThan(85);
    expect(b).toBeLessThan(95);
  });

  it('reports due south as ~180', () => {
    expect(bearingDeg(47, -122, 46, -122)).toBeCloseTo(180, 0);
  });
});

describe('compassLabel', () => {
  it('maps 0 to N and 90 to E', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(90)).toBe('E');
  });

  it('wraps 360 back to N', () => {
    expect(compassLabel(360)).toBe('N');
  });
});
