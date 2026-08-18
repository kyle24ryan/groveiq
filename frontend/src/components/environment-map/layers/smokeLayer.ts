import type { Map as MapboxMap, GeoJSONSource } from 'mapbox-gl';
import { fetchSmokePlumes } from '../../../lib/api';

export const SMOKE_SOURCE_ID = 'hms-smoke-plumes';
export const SMOKE_FILL_LAYER_ID = 'hms-smoke-plumes-fill';
export const SMOKE_OUTLINE_LAYER_ID = 'hms-smoke-plumes-outline';

export type SmokeStatus =
  | { state: 'loading' }
  | { state: 'ready'; count: number }
  | { state: 'error'; message: string };

// Density styling uses color AND outline weight/dash together (not color
// alone) so density reads even without color vision -- Light gets a thin
// dashed outline, Heavy a thick solid one. NOAA's Density is a qualitative
// analyst call on satellite-imagery plume thickness, not a measured
// concentration, so this is deliberately a 3-step categorical style, not a
// continuous "more red = more smoke" gradient that would overstate the
// data's precision.
const DENSITY_STYLE: Record<string, { color: string; lineWidth: number; dash: number[] | undefined }> = {
  Light: { color: '#FCD34D', lineWidth: 1, dash: [2, 2] },
  Medium: { color: '#F59E0B', lineWidth: 2, dash: [4, 2] },
  Heavy: { color: '#B91C1C', lineWidth: 2.5, dash: undefined },
  Unknown: { color: '#9CA3AF', lineWidth: 1, dash: [1, 1] },
};

const DENSITY_OUTLINE_LAYER_IDS = (['Light', 'Medium', 'Heavy', 'Unknown'] as const).map((d) => `${SMOKE_OUTLINE_LAYER_ID}-${d.toLowerCase()}`);

export function removeSmokeLayer(map: MapboxMap): void {
  for (const id of DENSITY_OUTLINE_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getLayer(SMOKE_FILL_LAYER_ID)) map.removeLayer(SMOKE_FILL_LAYER_ID);
  if (map.getSource(SMOKE_SOURCE_ID)) map.removeSource(SMOKE_SOURCE_ID);
}

export async function loadSmokeLayer(map: MapboxMap, signal: AbortSignal, onStatus: (status: SmokeStatus) => void): Promise<void> {
  onStatus({ state: 'loading' });
  let data: Awaited<ReturnType<typeof fetchSmokePlumes>>;
  try {
    data = await fetchSmokePlumes();
  } catch (err) {
    if (signal.aborted) return;
    onStatus({ state: 'error', message: err instanceof Error ? err.message : 'Smoke data unavailable' });
    return;
  }
  if (signal.aborted) return;

  const geojson = {
    ...data,
    features: data.features.map((f) => {
      const style = DENSITY_STYLE[f.properties.density] ?? DENSITY_STYLE.Unknown;
      return { ...f, properties: { ...f.properties, color: style.color, lineWidth: style.lineWidth } };
    }),
  };

  const existingSource = map.getSource(SMOKE_SOURCE_ID);
  if (existingSource && 'setData' in existingSource) {
    (existingSource as GeoJSONSource).setData(geojson);
  } else {
    map.addSource(SMOKE_SOURCE_ID, { type: 'geojson', data: geojson });
    map.addLayer({
      id: SMOKE_FILL_LAYER_ID,
      type: 'fill',
      source: SMOKE_SOURCE_ID,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
    });
    // Line-dasharray can't be data-driven per-feature in Mapbox GL the way
    // fill-color can (it isn't a supported data-expression property), so
    // density-specific dash patterns are applied as three separate
    // outline layers filtered by density, all sharing the same fill
    // layer/source above.
    for (const density of ['Light', 'Medium', 'Heavy', 'Unknown'] as const) {
      const style = DENSITY_STYLE[density];
      const layerId = `${SMOKE_OUTLINE_LAYER_ID}-${density.toLowerCase()}`;
      map.addLayer({
        id: layerId,
        type: 'line',
        source: SMOKE_SOURCE_ID,
        filter: ['==', ['get', 'density'], density],
        paint: {
          'line-color': style.color,
          'line-width': style.lineWidth,
          ...(style.dash ? { 'line-dasharray': style.dash } : {}),
        },
      });
    }
  }

  onStatus({ state: 'ready', count: geojson.features.length });
}
