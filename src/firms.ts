// NASA FIRMS (Fire Information for Resource Management System) -- near
// real-time active fire/thermal-anomaly detections from VIIRS, for the
// Air & fire map layer (Mapbox brief step 5).
//
// These are satellite thermal-anomaly detections, not a fire perimeter and
// not a forecast -- a single VIIRS pixel (~375m) reads hot and gets
// flagged. It can be an active fire, a flare, or (rarely) another intense
// heat source. Every place this data reaches the UI must say "detected
// hotspot" language, never "fire boundary" or "burning area" -- same
// don't-fabricate-data posture as the rest of this app (see the AQI ring
// and wind particles in layers/localConditionsLayer.ts, which stay
// point-anchored rather than implying a regional field they don't have
// data for).
import type { Env } from './env';
import { distanceKm, bearingDeg, compassLabel } from './geo';
import { GROVE_LAT, GROVE_LON } from './nws';
import type { GeoJsonFeatureCollection, GeoJsonPointGeometry } from './geojsonTypes';

// West, south, east, north -- a generous Pacific Northwest box (WA, OR,
// northern ID) around the grove, wide enough to catch a regional smoke
// season's worth of fire activity without pulling in all of North America.
const PNW_BBOX = { west: -125, south: 42, east: -116.5, north: 49.5 };
const SOURCE = 'VIIRS_SNPP_NRT';
const DAY_RANGE = 1; // near-real-time: last 24 hours

export type FirmsDetection = {
  lat: number;
  lon: number;
  acqDateIso: string; // acquisition date+time, UTC, ISO 8601
  satellite: string;
  confidence: string; // VIIRS NRT: "low" | "nominal" | "high"
  frpMw: number | null; // Fire Radiative Power, megawatts
  daynight: 'Day' | 'Night' | null;
  distanceKm: number;
  bearingDeg: number;
  bearingCompass: string;
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

const VIIRS_CONFIDENCE_LABEL: Record<string, string> = { l: 'low', n: 'nominal', h: 'high' };

export function parseFirmsCsv(csvText: string): FirmsDetection[] {
  const rows = parseCsv(csvText);
  const detections: FirmsDetection[] = [];

  for (const row of rows) {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    // acq_date is YYYY-MM-DD, acq_time is HHMM (UTC, zero-padded to 4
    // digits by FIRMS -- but be defensive since it's a text CSV field).
    const acqDate = row.acq_date ?? '';
    const acqTimeRaw = (row.acq_time ?? '').padStart(4, '0');
    const hh = acqTimeRaw.slice(0, 2);
    const mm = acqTimeRaw.slice(2, 4);
    const acqDateIso = acqDate ? `${acqDate}T${hh}:${mm}:00Z` : new Date().toISOString();

    const dist = distanceKm(GROVE_LAT, GROVE_LON, lat, lon);
    const bearing = bearingDeg(GROVE_LAT, GROVE_LON, lat, lon);
    const confidenceRaw = (row.confidence ?? '').toLowerCase();

    detections.push({
      lat,
      lon,
      acqDateIso,
      satellite: row.satellite || SOURCE,
      confidence: VIIRS_CONFIDENCE_LABEL[confidenceRaw] ?? confidenceRaw ?? 'unknown',
      frpMw: row.frp ? Number(row.frp) : null,
      daynight: row.daynight === 'D' ? 'Day' : row.daynight === 'N' ? 'Night' : null,
      distanceKm: Math.round(dist * 10) / 10,
      bearingDeg: Math.round(bearing),
      bearingCompass: compassLabel(bearing),
    });
  }

  return detections;
}

export async function fetchActiveFires(env: Env): Promise<FirmsDetection[] | null> {
  if (!env.NASA_FIRMS_MAP_KEY) return null;

  const coords = `${PNW_BBOX.west},${PNW_BBOX.south},${PNW_BBOX.east},${PNW_BBOX.north}`;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${env.NASA_FIRMS_MAP_KEY}/${SOURCE}/${coords}/${DAY_RANGE}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FIRMS API returned ${response.status}`);
  }
  const text = await response.text();
  // FIRMS returns a plain-text error body (not CSV, no header row) on a
  // bad key or malformed request rather than an HTTP error status --
  // detect that rather than trying to parse it as detections.
  if (!text.includes('latitude') && !text.includes('longitude')) {
    throw new Error(`FIRMS API returned unexpected body: ${text.slice(0, 200)}`);
  }
  return parseFirmsCsv(text);
}

export function detectionsToGeoJson(detections: FirmsDetection[]): GeoJsonFeatureCollection<GeoJsonPointGeometry> {
  return {
    type: 'FeatureCollection',
    features: detections.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
      properties: {
        acqDateIso: d.acqDateIso,
        satellite: d.satellite,
        confidence: d.confidence,
        frpMw: d.frpMw,
        daynight: d.daynight,
        distanceKm: d.distanceKm,
        bearingDeg: d.bearingDeg,
        bearingCompass: d.bearingCompass,
        source: 'NASA FIRMS VIIRS detected hotspot (not a fire perimeter)',
      },
    })),
  };
}
