import { describe, it, expect } from 'vitest';
import { pm25ToAqi, aqiCategoryLabel } from './purpleair';

describe('pm25ToAqi', () => {
  it('maps 0 to AQI 0', () => {
    expect(pm25ToAqi(0)).toBe(0);
  });

  it('maps the breakpoint boundaries to the EPA 2024-revised round numbers', () => {
    expect(pm25ToAqi(9.0)).toBe(50);
    expect(pm25ToAqi(35.4)).toBe(100);
    expect(pm25ToAqi(55.4)).toBe(150);
    expect(pm25ToAqi(125.4)).toBe(200);
    expect(pm25ToAqi(225.4)).toBe(300);
  });

  it('interpolates within a band (moderate range)', () => {
    // Midpoint of the 9.1-35.4 -> 51-100 band should land roughly midway.
    const aqi = pm25ToAqi(22.25)!;
    expect(aqi).toBeGreaterThan(70);
    expect(aqi).toBeLessThan(85);
  });

  it('caps at 500 above the highest published breakpoint rather than extrapolating', () => {
    expect(pm25ToAqi(1000)).toBe(500);
  });

  it('returns null for a negative reading rather than fabricating a value', () => {
    expect(pm25ToAqi(-5)).toBeNull();
  });
});

describe('aqiCategoryLabel', () => {
  it('labels the standard EPA bands', () => {
    expect(aqiCategoryLabel(25)).toBe('Good');
    expect(aqiCategoryLabel(75)).toBe('Moderate');
    expect(aqiCategoryLabel(125)).toBe('Unhealthy for sensitive groups');
    expect(aqiCategoryLabel(175)).toBe('Unhealthy');
    expect(aqiCategoryLabel(250)).toBe('Very unhealthy');
    expect(aqiCategoryLabel(400)).toBe('Hazardous');
  });
});
