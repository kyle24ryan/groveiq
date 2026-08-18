import type { Map as MapboxMap, GeoJSONSource, MapLayerMouseEvent } from 'mapbox-gl';
import mapboxgl from 'mapbox-gl';
import { fetchActiveFires, type FirmsDetectionProperties } from '../../../lib/api';

export const FIRMS_SOURCE_ID = 'firms-fire-detections';
export const FIRMS_CLUSTER_LAYER_ID = 'firms-clusters';
export const FIRMS_CLUSTER_COUNT_LAYER_ID = 'firms-cluster-count';
export const FIRMS_POINT_LAYER_ID = 'firms-points';

export type FirmsStatus =
  | { state: 'loading' }
  | { state: 'ready'; count: number }
  | { state: 'unavailable' } // key not configured server-side
  | { state: 'error'; message: string };

const LAYER_IDS = [FIRMS_CLUSTER_LAYER_ID, FIRMS_CLUSTER_COUNT_LAYER_ID, FIRMS_POINT_LAYER_ID];

let clusterClickHandler: ((e: MapLayerMouseEvent) => void) | null = null;
let pointClickHandler: ((e: MapLayerMouseEvent) => void) | null = null;
let enterHandler: (() => void) | null = null;
let leaveHandler: (() => void) | null = null;

export function removeFirmsLayer(map: MapboxMap): void {
  if (clusterClickHandler) map.off('click', FIRMS_CLUSTER_LAYER_ID, clusterClickHandler);
  if (pointClickHandler) map.off('click', FIRMS_POINT_LAYER_ID, pointClickHandler);
  if (enterHandler) {
    map.off('mouseenter', FIRMS_CLUSTER_LAYER_ID, enterHandler);
    map.off('mouseenter', FIRMS_POINT_LAYER_ID, enterHandler);
  }
  if (leaveHandler) {
    map.off('mouseleave', FIRMS_CLUSTER_LAYER_ID, leaveHandler);
    map.off('mouseleave', FIRMS_POINT_LAYER_ID, leaveHandler);
  }
  clusterClickHandler = null;
  pointClickHandler = null;
  enterHandler = null;
  leaveHandler = null;
  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(FIRMS_SOURCE_ID)) map.removeSource(FIRMS_SOURCE_ID);
}

function buildPopupContent(props: FirmsDetectionProperties): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'font-size:12.5px;min-width:170px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;margin-bottom:2px;';
  title.textContent = 'Detected hotspot';
  container.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'color:#9CA3AF;margin-bottom:6px;';
  subtitle.textContent = 'NASA FIRMS satellite detection -- not a fire perimeter';
  container.appendChild(subtitle);

  const rows: [string, string][] = [
    ['Detected', new Date(props.acqDateIso).toLocaleString()],
    ['Satellite', props.satellite],
    ['Confidence', props.confidence],
    ['From grove', `${props.distanceKm} km ${props.bearingCompass}`],
    ['FRP', props.frpMw != null ? `${props.frpMw} MW` : '—'],
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

// Clustered (native Mapbox GL clustering, not server-side) so a busy fire
// season doesn't render dozens of overlapping points -- clusters expand on
// click by zooming toward the cluster's expansion zoom, standard Mapbox
// pattern. Unclustered points are individually clickable, matching
// PurpleAir's marker interaction.
export async function loadFirmsLayer(map: MapboxMap, signal: AbortSignal, onStatus: (status: FirmsStatus) => void): Promise<void> {
  onStatus({ state: 'loading' });
  let data: Awaited<ReturnType<typeof fetchActiveFires>>;
  try {
    data = await fetchActiveFires();
  } catch (err) {
    if (signal.aborted) return;
    onStatus({ state: 'error', message: err instanceof Error ? err.message : 'FIRMS unavailable' });
    return;
  }
  if (signal.aborted) return;

  if (data === null) {
    onStatus({ state: 'unavailable' });
    return;
  }

  const existingSource = map.getSource(FIRMS_SOURCE_ID);
  if (existingSource && 'setData' in existingSource) {
    (existingSource as GeoJSONSource).setData(data);
    onStatus({ state: 'ready', count: data.features.length });
    return;
  }

  map.addSource(FIRMS_SOURCE_ID, { type: 'geojson', data, cluster: true, clusterRadius: 40, clusterMaxZoom: 9 });

  map.addLayer({
    id: FIRMS_CLUSTER_LAYER_ID,
    type: 'circle',
    source: FIRMS_SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#EA580C',
      'circle-opacity': 0.75,
      'circle-radius': ['step', ['get', 'point_count'], 14, 5, 18, 20, 24],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
    },
  });
  map.addLayer({
    id: FIRMS_CLUSTER_COUNT_LAYER_ID,
    type: 'symbol',
    source: FIRMS_SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
    paint: { 'text-color': '#ffffff' },
  });
  map.addLayer({
    id: FIRMS_POINT_LAYER_ID,
    type: 'circle',
    source: FIRMS_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 6,
      'circle-color': '#EA580C',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.9,
    },
  });

  clusterClickHandler = async (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const clusterId = feature.properties?.cluster_id;
    const source = map.getSource(FIRMS_SOURCE_ID) as GeoJSONSource & { getClusterExpansionZoom(id: number): Promise<number> };
    try {
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
    } catch {
      // Non-fatal -- just skip the zoom if the cluster expansion lookup fails.
    }
  };
  pointClickHandler = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const props = feature.properties as unknown as FirmsDetectionProperties;
    const coords = feature.geometry.coordinates.slice() as [number, number];
    new mapboxgl.Popup({ offset: 10 }).setLngLat(coords).setDOMContent(buildPopupContent(props)).addTo(map);
  };
  enterHandler = () => {
    map.getCanvas().style.cursor = 'pointer';
  };
  leaveHandler = () => {
    map.getCanvas().style.cursor = '';
  };

  map.on('click', FIRMS_CLUSTER_LAYER_ID, clusterClickHandler);
  map.on('click', FIRMS_POINT_LAYER_ID, pointClickHandler);
  map.on('mouseenter', FIRMS_CLUSTER_LAYER_ID, enterHandler);
  map.on('mouseenter', FIRMS_POINT_LAYER_ID, enterHandler);
  map.on('mouseleave', FIRMS_CLUSTER_LAYER_ID, leaveHandler);
  map.on('mouseleave', FIRMS_POINT_LAYER_ID, leaveHandler);

  onStatus({ state: 'ready', count: data.features.length });
}
