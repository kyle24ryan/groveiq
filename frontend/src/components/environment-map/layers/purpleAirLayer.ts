import type { Map as MapboxMap, GeoJSONSource, MapLayerMouseEvent } from 'mapbox-gl';
import mapboxgl from 'mapbox-gl';
import { fetchPurpleAirSensors, type PurpleAirSensorProperties } from '../../../lib/api';

export const PURPLEAIR_SOURCE_ID = 'purpleair-sensors';
export const PURPLEAIR_LAYER_ID = 'purpleair-sensors-layer';

export type PurpleAirStatus =
  | { state: 'loading' }
  | { state: 'ready'; count: number }
  | { state: 'unavailable' } // key not configured server-side
  | { state: 'error'; message: string };

function aqiColor(aqi: number | null): string {
  if (aqi == null) return '#9CA3AF';
  if (aqi <= 50) return '#2F6D4F';
  if (aqi <= 100) return '#B45309';
  if (aqi <= 150) return '#C2410C';
  return '#B91C1C';
}

let clickHandler: ((e: MapLayerMouseEvent) => void) | null = null;
let enterHandler: (() => void) | null = null;
let leaveHandler: (() => void) | null = null;

export function removePurpleAirLayer(map: MapboxMap): void {
  if (clickHandler) map.off('click', PURPLEAIR_LAYER_ID, clickHandler);
  if (enterHandler) map.off('mouseenter', PURPLEAIR_LAYER_ID, enterHandler);
  if (leaveHandler) map.off('mouseleave', PURPLEAIR_LAYER_ID, leaveHandler);
  clickHandler = null;
  enterHandler = null;
  leaveHandler = null;
  if (map.getLayer(PURPLEAIR_LAYER_ID)) map.removeLayer(PURPLEAIR_LAYER_ID);
  if (map.getSource(PURPLEAIR_SOURCE_ID)) map.removeSource(PURPLEAIR_SOURCE_ID);
}

// Popup content built as real DOM nodes (not an HTML string) -- same
// reason as GroveMarker.ts's popup: a PurpleAir sensor's `name` is
// arbitrary text set by whoever registered that sensor on the public
// network, not something GroveIQ controls, so it must never be injected
// as raw HTML.
function buildPopupContent(props: PurpleAirSensorProperties): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'font-size:12.5px;min-width:160px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;margin-bottom:2px;';
  title.textContent = props.name;
  container.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'color:#9CA3AF;margin-bottom:6px;';
  subtitle.textContent = 'PurpleAir community sensor (raw reading)';
  container.appendChild(subtitle);

  const rows: [string, string][] = [
    ['PM2.5', props.pm25 != null ? `${props.pm25.toFixed(1)} µg/m³` : '—'],
    ['AQI', props.aqi != null ? `${props.aqi} · ${props.aqiCategory ?? ''}` : '—'],
    ['Last seen', props.lastSeenIso ? new Date(props.lastSeenIso).toLocaleString() : '—'],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    container.appendChild(row);
  }

  return container;
}

// Individually clickable circle markers, one per nearby PurpleAir
// community sensor -- visually and textually distinct ("PurpleAir
// community sensor, raw reading") from GroveIQ's own local sensor ring, so
// the two can't be mistaken for the same measurement.
export async function loadPurpleAirLayer(map: MapboxMap, signal: AbortSignal, onStatus: (status: PurpleAirStatus) => void): Promise<void> {
  onStatus({ state: 'loading' });
  let data: Awaited<ReturnType<typeof fetchPurpleAirSensors>>;
  try {
    data = await fetchPurpleAirSensors();
  } catch (err) {
    if (signal.aborted) return;
    onStatus({ state: 'error', message: err instanceof Error ? err.message : 'PurpleAir unavailable' });
    return;
  }
  if (signal.aborted) return;

  if (data === null) {
    onStatus({ state: 'unavailable' });
    return;
  }

  const geojson = {
    ...data,
    features: data.features.map((f) => ({ ...f, properties: { ...f.properties, color: aqiColor(f.properties.aqi) } })),
  };

  const existingSource = map.getSource(PURPLEAIR_SOURCE_ID);
  if (existingSource && 'setData' in existingSource) {
    (existingSource as GeoJSONSource).setData(geojson);
  } else {
    map.addSource(PURPLEAIR_SOURCE_ID, { type: 'geojson', data: geojson });
    map.addLayer({
      id: PURPLEAIR_LAYER_ID,
      type: 'circle',
      source: PURPLEAIR_SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.9,
      },
    });

    clickHandler = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const props = feature.properties as unknown as PurpleAirSensorProperties;
      const coords = feature.geometry.coordinates.slice() as [number, number];
      new mapboxgl.Popup({ offset: 10 }).setLngLat(coords).setDOMContent(buildPopupContent(props)).addTo(map);
    };
    enterHandler = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    leaveHandler = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', PURPLEAIR_LAYER_ID, clickHandler);
    map.on('mouseenter', PURPLEAIR_LAYER_ID, enterHandler);
    map.on('mouseleave', PURPLEAIR_LAYER_ID, leaveHandler);
  }

  onStatus({ state: 'ready', count: geojson.features.length });
}
