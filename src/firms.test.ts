import { describe, it, expect } from 'vitest';
import { parseFirmsCsv } from './firms';

const SAMPLE_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
47.60,-121.30,320.5,0.4,0.4,2026-08-17,1342,N,VIIRS,n,2.0NRT,290.1,12.3,D
47.55,-121.25,335.2,0.4,0.4,2026-08-17,145,N,VIIRS,h,2.0NRT,295.0,45.7,N`;

describe('parseFirmsCsv', () => {
  it('parses each row into a detection with computed distance/bearing from the grove', () => {
    const detections = parseFirmsCsv(SAMPLE_CSV);
    expect(detections).toHaveLength(2);
    expect(detections[0].lat).toBeCloseTo(47.6, 5);
    expect(detections[0].lon).toBeCloseTo(-121.3, 5);
    expect(detections[0].distanceKm).toBeGreaterThan(0);
    expect(detections[0].bearingCompass).toMatch(/^[NSEW]+$/);
  });

  it('maps VIIRS single-letter confidence codes to readable labels', () => {
    const detections = parseFirmsCsv(SAMPLE_CSV);
    expect(detections[0].confidence).toBe('nominal');
    expect(detections[1].confidence).toBe('high');
  });

  it('zero-pads a short acq_time into a valid ISO timestamp', () => {
    const detections = parseFirmsCsv(SAMPLE_CSV);
    // acq_time "145" -> "0145" -> 01:45 UTC, not "14:5" or a parse failure.
    expect(detections[1].acqDateIso).toBe('2026-08-17T01:45:00Z');
  });

  it('maps daynight codes to Day/Night', () => {
    const detections = parseFirmsCsv(SAMPLE_CSV);
    expect(detections[0].daynight).toBe('Day');
    expect(detections[1].daynight).toBe('Night');
  });

  it('returns an empty array for a header-only or empty response', () => {
    expect(parseFirmsCsv('latitude,longitude,acq_date,acq_time\n')).toEqual([]);
    expect(parseFirmsCsv('')).toEqual([]);
  });
});
