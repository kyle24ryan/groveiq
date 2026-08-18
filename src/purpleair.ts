// PurpleAir community sensor network -- nearby-sensor markers for the
// Air & fire map layer (Mapbox brief step 4). Server-side only: the
// PurpleAir API key never reaches the browser, matching the ethos of every
// other keyed integration in this codebase (AirNow, FIRMS, Ecowitt).
//
// PurpleAir sensors report raw PM2.5 concentration, not AQI -- there's no
// AQI field in the API response. AQI here is computed with the standard
// EPA breakpoint formula (the 2024-revised PM2.5 breakpoints, effective
// May 2024), same public-domain math AirNow itself uses. This is a
// straightforward, correct unit conversion, not an invented value -- but
// PurpleAir's raw sensors are well known to read high relative to
// EPA-reference monitors, especially in smoke, and there's no verified
// site-specific correction factor for these particular sensors, so the
// UI must say "PurpleAir community sensor (raw reading)" rather than
// imply it's been corrected to match a reference monitor.
import type { Env } from './env';
import { GROVE_LAT, GROVE_LON } from './nws';
import type { GeoJsonFeatureCollection, GeoJsonPointGeometry } from './geojsonTypes';

// ~0.4 degrees of lat/lon is roughly a 45-mile-wide box centered on the
// grove -- "nearby community sensors" per the brief, not a regional
// PurpleAir crawl (that's still covered by the PurpleAir iframe in
// RegionalMaps.tsx until/unless that's retired).
const BOX_DEG = 0.4;

export type PurpleAirSensor = {
  sensorIndex: number;
  name: string;
  lat: number;
  lon: number;
  pm25: number | null;
  aqi: number | null;
  aqiCategory: string | null;
  lastSeenIso: string | null;
  confidence: number | null;
};

type PurpleAirResponse = {
  fields: string[];
  data: (number | string | null)[][];
};

// EPA's 2024-revised PM2.5 -> AQI breakpoints (24-hr average, µg/m^3).
// [concentrationLow, concentrationHigh, aqiLow, aqiHigh]
const PM25_BREAKPOINTS: [number, number, number, number][] = [
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];

export function pm25ToAqi(pm25: number): number | null {
  if (pm25 < 0) return null;
  for (const [cLow, cHigh, aqiLow, aqiHigh] of PM25_BREAKPOINTS) {
    if (pm25 <= cHigh) {
      const clamped = Math.max(pm25, cLow);
      return Math.round(((aqiHigh - aqiLow) / (cHigh - cLow)) * (clamped - cLow) + aqiLow);
    }
  }
  // Above the top published breakpoint -- report the ceiling rather than
  // extrapolating past what EPA has actually defined.
  return 500;
}

export function aqiCategoryLabel(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

export async function fetchNearbySensors(env: Env): Promise<PurpleAirSensor[] | null> {
  if (!env.PURPLEAIR_API_KEY) return null;

  const url = new URL('https://api.purpleair.com/v1/sensors');
  url.searchParams.set('fields', 'sensor_index,name,latitude,longitude,last_seen,confidence,pm2.5,location_type');
  url.searchParams.set('nwlng', String(GROVE_LON - BOX_DEG));
  url.searchParams.set('nwlat', String(GROVE_LAT + BOX_DEG));
  url.searchParams.set('selng', String(GROVE_LON + BOX_DEG));
  url.searchParams.set('selat', String(GROVE_LAT - BOX_DEG));

  const response = await fetch(url.toString(), { headers: { 'X-API-Key': env.PURPLEAIR_API_KEY } });
  if (!response.ok) {
    throw new Error(`PurpleAir API returned ${response.status}`);
  }

  const body = (await response.json()) as PurpleAirResponse;
  const idx = (field: string) => body.fields.indexOf(field);
  const iName = idx('name');
  const iLat = idx('latitude');
  const iLon = idx('longitude');
  const iLastSeen = idx('last_seen');
  const iConfidence = idx('confidence');
  const iPm25 = idx('pm2.5');
  const iLocationType = idx('location_type');
  const iSensorIndex = idx('sensor_index');

  const sensors: PurpleAirSensor[] = [];
  for (const row of body.data ?? []) {
    // location_type: 0 = outside, 1 = inside. An indoor reading isn't
    // representative of ambient/grove-relevant air quality, so it's
    // dropped rather than shown as if it were an outdoor community
    // reading.
    if (iLocationType >= 0 && row[iLocationType] !== 0) continue;

    const lat = iLat >= 0 ? (row[iLat] as number | null) : null;
    const lon = iLon >= 0 ? (row[iLon] as number | null) : null;
    if (lat == null || lon == null) continue;

    const pm25 = iPm25 >= 0 ? (row[iPm25] as number | null) : null;
    const aqi = pm25 != null ? pm25ToAqi(pm25) : null;
    const lastSeenEpoch = iLastSeen >= 0 ? (row[iLastSeen] as number | null) : null;

    sensors.push({
      sensorIndex: iSensorIndex >= 0 ? Number(row[iSensorIndex]) || 0 : 0,
      name: iName >= 0 ? String(row[iName] ?? 'PurpleAir sensor') : 'PurpleAir sensor',
      lat,
      lon,
      pm25,
      aqi,
      aqiCategory: aqi != null ? aqiCategoryLabel(aqi) : null,
      lastSeenIso: lastSeenEpoch != null ? new Date(lastSeenEpoch * 1000).toISOString() : null,
      confidence: iConfidence >= 0 ? (row[iConfidence] as number | null) : null,
    });
  }

  return sensors;
}

export function sensorsToGeoJson(sensors: PurpleAirSensor[]): GeoJsonFeatureCollection<GeoJsonPointGeometry> {
  return {
    type: 'FeatureCollection',
    features: sensors.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        sensorIndex: s.sensorIndex,
        name: s.name,
        pm25: s.pm25,
        aqi: s.aqi,
        aqiCategory: s.aqiCategory,
        lastSeenIso: s.lastSeenIso,
        confidence: s.confidence,
        source: 'PurpleAir community sensor (raw reading)',
      },
    })),
  };
}
