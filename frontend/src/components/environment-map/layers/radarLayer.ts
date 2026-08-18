import type { Map as MapboxMap } from 'mapbox-gl';

export const RAIN_SOURCE_ID = 'rainviewer-radar';
export const RAIN_LAYER_ID = 'rainviewer-radar-layer';

export type RadarStatus =
  | { state: 'loading' }
  | { state: 'ready'; label: string; frameTime: Date }
  | { state: 'empty' }
  | { state: 'error'; message: string };

function firstSymbolLayerId(map: MapboxMap): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
}

export function removeRadarLayer(map: MapboxMap): void {
  if (map.getLayer(RAIN_LAYER_ID)) map.removeLayer(RAIN_LAYER_ID);
  if (map.getSource(RAIN_SOURCE_ID)) map.removeSource(RAIN_SOURCE_ID);
}

// RainViewer's public radar tile API -- keyless today, but isolated
// behind this module (not inlined into map lifecycle code) so it can be
// swapped for a licensed/authoritative source like NOAA MRMS later
// without touching the map shell or panel UI. Reports explicit
// loading/ready/empty/error states rather than leaving the UI stuck on
// "Loading..." when the manifest comes back empty or the fetch fails.
export async function loadRadarLayer(map: MapboxMap, signal: AbortSignal, onStatus: (status: RadarStatus) => void): Promise<void> {
  onStatus({ state: 'loading' });

  let data: { host: string; radar: { past: { time: number; path: string }[] } };
  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal });
    if (!response.ok) throw new Error(`RainViewer returned HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    if (signal.aborted) return;
    onStatus({ state: 'error', message: err instanceof Error ? err.message : 'Radar unavailable' });
    return;
  }
  if (signal.aborted) return;

  const latest = data.radar?.past?.[data.radar.past.length - 1];
  if (!latest) {
    onStatus({ state: 'empty' });
    return;
  }

  const tileUrl = `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
  removeRadarLayer(map);

  // RainViewer's tile server doesn't serve tiles past z10 -- without
  // maxzoom, zooming in past that shows their own "Zoom Level Not
  // Supported" placeholder image instead of radar. Capping it here makes
  // Mapbox overzoom (upscale) the z10 tile instead, same as any other
  // raster source with limited native resolution.
  map.addSource(RAIN_SOURCE_ID, {
    type: 'raster',
    tiles: [tileUrl],
    tileSize: 256,
    maxzoom: 10,
    attribution: 'Radar © <a href="https://www.rainviewer.com" target="_blank" rel="noreferrer">RainViewer</a>',
  });
  // Insert below the first symbol (label) layer so place/road names stay
  // legible under the radar overlay instead of being washed out -- a
  // plain addLayer() with no beforeId stacks new layers above everything
  // in the current style, including labels.
  map.addLayer({ id: RAIN_LAYER_ID, type: 'raster', source: RAIN_SOURCE_ID, paint: { 'raster-opacity': 0.65 } }, firstSymbolLayerId(map));

  onStatus({ state: 'ready', label: 'RainViewer radar', frameTime: new Date(latest.time * 1000) });
}
