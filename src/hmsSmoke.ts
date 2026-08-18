// NOAA HMS (Hazard Mapping System) satellite smoke plume polygons, for the
// Air & fire map layer (Mapbox brief step 5). NOAA/NESDIS publishes these
// as daily shapefiles at
// https://www.ospo.noaa.gov/products/land/hms.html; parsing raw
// shapefiles in a Worker (no filesystem, no native shapefile lib) isn't
// practical, so this uses NOAA's own public ArcGIS FeatureServer for the
// same dataset instead -- confirmed live and queryable in GeoJSON directly
// (services2.arcgis.com/.../NOAA_Satellite_Smoke_Detection_(v1)/FeatureServer),
// same underlying analyst-drawn polygons, no parsing risk from hand-rolling
// shapefile binary parsing.
//
// These are observed smoke plume polygons from satellite imagery -- not a
// concentration forecast and not tied 1:1 to ground-level AQI. Density
// (light/medium/heavy) is NOAA's own qualitative call on plume thickness
// in the imagery, not a measured concentration. Every UI surface for this
// must say "observed plume" language, matching the same posture as
// firms.ts's "detected hotspot, not a fire perimeter" framing.
import { distanceKm } from './geo';
import { GROVE_LAT, GROVE_LON } from './nws';
import type { GeoJsonFeatureCollection, GeoJsonGeometry, GeoJsonPolygonGeometry, GeoJsonMultiPolygonGeometry } from './geojsonTypes';

const HMS_FEATURE_SERVICE_QUERY_URL =
  'https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/NOAA_Satellite_Smoke_Detection_(v1)/FeatureServer/0/query';

// Same PNW box as firms.ts.
const PNW_BBOX = { west: -125, south: 42, east: -116.5, north: 49.5 };

export type SmokeDensity = 'Light' | 'Medium' | 'Heavy' | 'Unknown';

export type SmokePlumeProperties = {
  satellite: string;
  density: SmokeDensity;
  startTimeIso: string | null;
  endTimeIso: string | null;
  distanceFromGroveKm: number | null; // distance to polygon centroid, approximate
};

// HMS's Start/End_ fields are "YYYYDDD HHMM" -- 4-digit year, 3-digit
// day-of-year, space, 4-digit UTC hour/minute (e.g. "2026229 0950" = the
// 229th day of 2026 at 09:50 UTC). Returns null rather than guessing if the
// format doesn't match what's documented.
export function parseHmsTimeField(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})(\d{3})\s+(\d{2})(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearStr, dayOfYearStr, hh, mm] = match;
  const year = Number(yearStr);
  const dayOfYear = Number(dayOfYearStr);
  // Jan 1 00:00 UTC of `year` plus (dayOfYear - 1) days.
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() + (dayOfYear - 1));
  date.setUTCHours(Number(hh), Number(mm), 0, 0);
  return date.toISOString();
}

function normalizeDensity(raw: string | null | undefined): SmokeDensity {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'light') return 'Light';
  if (v === 'medium') return 'Medium';
  if (v === 'heavy') return 'Heavy';
  return 'Unknown';
}

// Rough polygon centroid (average of ring vertices) -- fine for "how far
// from the grove is this plume, roughly", not used for anything geometric.
function ringCentroid(coords: number[][]): [number, number] {
  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of coords) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / coords.length, sumLat / coords.length];
}

function polygonCentroid(geometry: GeoJsonGeometry): [number, number] | null {
  try {
    if (geometry.type === 'Polygon') {
      const rings = (geometry as GeoJsonPolygonGeometry).coordinates;
      if (!rings[0]?.length) return null;
      return ringCentroid(rings[0] as number[][]);
    }
    if (geometry.type === 'MultiPolygon') {
      const polys = (geometry as GeoJsonMultiPolygonGeometry).coordinates;
      const outerRing = polys[0]?.[0];
      if (!outerRing?.length) return null;
      return ringCentroid(outerRing as number[][]);
    }
  } catch {
    return null;
  }
  return null;
}

type HmsArcgisProperties = { Satellite?: string; Start?: string; End_?: string; Density?: string };

export async function fetchSmokePlumes(): Promise<GeoJsonFeatureCollection<GeoJsonGeometry, SmokePlumeProperties & { source: string }>> {
  const envelope = `${PNW_BBOX.west},${PNW_BBOX.south},${PNW_BBOX.east},${PNW_BBOX.north}`;
  const url = new URL(HMS_FEATURE_SERVICE_QUERY_URL);
  url.searchParams.set('where', '1=1');
  url.searchParams.set('geometry', envelope);
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'geojson');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`NOAA HMS smoke service returned ${response.status}`);
  }
  const raw = (await response.json()) as GeoJsonFeatureCollection<GeoJsonGeometry, HmsArcgisProperties>;

  const features = (raw.features ?? []).map((f) => {
    const props = f.properties ?? {};
    const centroid = f.geometry ? polygonCentroid(f.geometry) : null;
    const properties: SmokePlumeProperties = {
      satellite: props.Satellite ?? 'unknown',
      density: normalizeDensity(props.Density),
      startTimeIso: parseHmsTimeField(props.Start),
      endTimeIso: parseHmsTimeField(props.End_),
      distanceFromGroveKm: centroid ? Math.round(distanceKm(GROVE_LAT, GROVE_LON, centroid[1], centroid[0]) * 10) / 10 : null,
    };
    return { ...f, properties: { ...properties, source: 'NOAA HMS observed smoke plume (satellite analyst estimate, not a concentration forecast)' } };
  });

  return { type: 'FeatureCollection', features };
}
