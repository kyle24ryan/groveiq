import type { Map as MapboxMap } from 'mapbox-gl';
import type { Feature, Point } from 'geojson';
import { GROVE_LAT, GROVE_LON } from '../../../lib/location';
import { aqiCategory } from '../../../lib/aqi';

export const IMPACT_RING_SOURCE_ID = 'grove-impact-ring';
export const IMPACT_RING_LAYER_ID = 'grove-impact-ring-layer';
export const WIND_PARTICLE_SOURCE_ID = 'grove-wind-particles';
export const WIND_PARTICLE_LAYER_ID = 'grove-wind-particles-layer';
export const WIND_PARTICLE_COUNT = 7;
export const WIND_PARTICLE_LIFE_MS = 2200;

export function ringColorForWind(mph: number | null | undefined): string {
  if (mph == null) return '#9CA3AF';
  if (mph >= 25) return '#B91C1C';
  if (mph >= 12) return '#B45309';
  return '#2F6D4F';
}

export function ringColorForAqi(aqi: number | null | undefined): string {
  if (aqi == null) return '#9CA3AF';
  const status = aqiCategory(aqi).status;
  return status === 'urgent' ? '#B91C1C' : status === 'watch' ? '#B45309' : '#2F6D4F';
}

// Local AQI ring: a colored circle around the grove marker, sized/colored
// from the real point AQI reading. Deliberately stays a point indicator
// rather than an invented regional smoke/AQI contour -- there's only one
// sensor reading here, not a gridded dataset.
export function syncAqiRing(map: MapboxMap, show: boolean, localAqi: number | null): void {
  if (!show) {
    removeAqiRing(map);
    return;
  }
  const color = ringColorForAqi(localAqi);
  const geojson: Feature<Point> = { type: 'Feature', geometry: { type: 'Point', coordinates: [GROVE_LON, GROVE_LAT] }, properties: {} };

  if (!map.getSource(IMPACT_RING_SOURCE_ID)) {
    map.addSource(IMPACT_RING_SOURCE_ID, { type: 'geojson', data: geojson });
    map.addLayer({
      id: IMPACT_RING_LAYER_ID,
      type: 'circle',
      source: IMPACT_RING_SOURCE_ID,
      paint: {
        'circle-radius': 42,
        'circle-color': color,
        'circle-opacity': 0.18,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': color,
        'circle-stroke-opacity': 0.6,
      },
    });
  } else {
    map.setPaintProperty(IMPACT_RING_LAYER_ID, 'circle-color', color);
    map.setPaintProperty(IMPACT_RING_LAYER_ID, 'circle-stroke-color', color);
  }
}

export function removeAqiRing(map: MapboxMap): void {
  if (map.getLayer(IMPACT_RING_LAYER_ID)) map.removeLayer(IMPACT_RING_LAYER_ID);
  if (map.getSource(IMPACT_RING_SOURCE_ID)) map.removeSource(IMPACT_RING_SOURCE_ID);
}

// Wind particle stream: small dots animate outward from the grove marker
// along the live wind direction, fading as they travel. Stylized, not a
// to-scale simulation -- stays anchored to the grove's single point
// reading rather than implying a gridded regional flow field we don't
// have data for. Distance traveled scales loosely with wind speed so
// calm vs. gusty reads as visually distinct, not to convey real-world
// scale.
export function ensureWindParticleLayer(map: MapboxMap, windMph: number | null): void {
  const color = ringColorForWind(windMph);
  if (!map.getSource(WIND_PARTICLE_SOURCE_ID)) {
    map.addSource(WIND_PARTICLE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: WIND_PARTICLE_LAYER_ID,
      type: 'circle',
      source: WIND_PARTICLE_SOURCE_ID,
      paint: { 'circle-radius': 4, 'circle-color': color, 'circle-opacity': ['get', 'opacity'] },
    });
  } else {
    map.setPaintProperty(WIND_PARTICLE_LAYER_ID, 'circle-color', color);
  }
}

export function removeWindParticleLayer(map: MapboxMap): void {
  if (map.getLayer(WIND_PARTICLE_LAYER_ID)) map.removeLayer(WIND_PARTICLE_LAYER_ID);
  if (map.getSource(WIND_PARTICLE_SOURCE_ID)) map.removeSource(WIND_PARTICLE_SOURCE_ID);
}

export function windParticleFeatures(windDirDeg: number, windMph: number | null, progressForIndex: (i: number) => number): Feature<Point>[] {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  // Wind direction is "from" (meteorological convention); particles
  // travel toward where the wind is blowing.
  const bearingRad = toRad(windDirDeg + 180);
  const dx = Math.sin(bearingRad);
  const dy = Math.cos(bearingRad);
  const latCos = Math.cos(toRad(GROVE_LAT)) || 1;
  const maxOffsetDeg = 0.0018 + Math.min(windMph ?? 0, 40) * 0.00006;

  return Array.from({ length: WIND_PARTICLE_COUNT }, (_, i) => {
    const t = progressForIndex(i);
    const dist = maxOffsetDeg * t;
    const lon = GROVE_LON + (dx * dist) / latCos;
    const lat = GROVE_LAT + dy * dist;
    return {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
      properties: { opacity: 0.7 * (1 - t) },
    };
  });
}

// Stagger each particle's phase against elapsedMs so they form a
// continuous stream rather than all pulsing in lockstep. Returns 0 (at
// the grove) -> 1 (fully traveled).
export function windParticleProgress(index: number, elapsedMs: number): number {
  const phaseOffsetMs = (WIND_PARTICLE_LIFE_MS / WIND_PARTICLE_COUNT) * index;
  const age = (elapsedMs + phaseOffsetMs) % WIND_PARTICLE_LIFE_MS;
  return age / WIND_PARTICLE_LIFE_MS;
}
