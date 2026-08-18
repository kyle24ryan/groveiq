import type { Map as MapboxMap, GeoJSONSource } from 'mapbox-gl';
import type { Feature, Geometry } from 'geojson';
import { fetchActiveWeatherAlerts, type NwsAlert } from '../../../lib/api';

export const ALERTS_SOURCE_ID = 'nws-active-alerts';
export const ALERTS_FILL_LAYER_ID = 'nws-active-alerts-fill';
export const ALERTS_OUTLINE_LAYER_ID = 'nws-active-alerts-outline';

export type AlertsStatus =
  | { state: 'loading' }
  | { state: 'ready'; alerts: NwsAlert[] }
  | { state: 'error'; message: string };

function severityColor(severity: string): string {
  switch (severity) {
    case 'Extreme':
      return '#7C1D1D';
    case 'Severe':
      return '#B91C1C';
    case 'Moderate':
      return '#B45309';
    default:
      return '#5B5BD6';
  }
}

export function removeAlertsLayer(map: MapboxMap): void {
  if (map.getLayer(ALERTS_OUTLINE_LAYER_ID)) map.removeLayer(ALERTS_OUTLINE_LAYER_ID);
  if (map.getLayer(ALERTS_FILL_LAYER_ID)) map.removeLayer(ALERTS_FILL_LAYER_ID);
  if (map.getSource(ALERTS_SOURCE_ID)) map.removeSource(ALERTS_SOURCE_ID);
}

// Draws polygon geometry only for alerts that actually carry one -- most
// NWS alerts are issued against county/zone UGC codes with geometry: null,
// and this must never invent a shape for those; the panel lists them as
// text instead (see EnvironmentalContextPanel's Storms rows). Severity is
// colored so an Extreme/Severe alert visually stands out from a routine
// advisory.
function applyAlertsToMap(map: MapboxMap, alerts: NwsAlert[]): void {
  const features: Feature<Geometry>[] = alerts
    .filter((a) => a.geometry != null)
    .map((a) => ({
      type: 'Feature',
      geometry: a.geometry as Geometry,
      properties: { event: a.event, severity: a.severity, color: severityColor(a.severity) },
    }));

  const geojson = { type: 'FeatureCollection' as const, features };
  const existing = map.getSource(ALERTS_SOURCE_ID);
  if (existing && 'setData' in existing) {
    (existing as GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(ALERTS_SOURCE_ID, { type: 'geojson', data: geojson });
  map.addLayer({
    id: ALERTS_FILL_LAYER_ID,
    type: 'fill',
    source: ALERTS_SOURCE_ID,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
  });
  map.addLayer({
    id: ALERTS_OUTLINE_LAYER_ID,
    type: 'line',
    source: ALERTS_SOURCE_ID,
    paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
  });
}

export async function loadAlertsLayer(map: MapboxMap, signal: AbortSignal, onStatus: (status: AlertsStatus) => void): Promise<void> {
  onStatus({ state: 'loading' });
  let alerts: NwsAlert[];
  try {
    alerts = await fetchActiveWeatherAlerts();
  } catch (err) {
    if (signal.aborted) return;
    onStatus({ state: 'error', message: err instanceof Error ? err.message : 'Alerts unavailable' });
    return;
  }
  if (signal.aborted) return;

  applyAlertsToMap(map, alerts);
  onStatus({ state: 'ready', alerts });
}
