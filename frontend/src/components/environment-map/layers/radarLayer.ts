import type { Map as MapboxMap, RasterTileSource } from 'mapbox-gl';

export const RAIN_SOURCE_ID = 'rainviewer-radar';
export const RAIN_LAYER_ID = 'rainviewer-radar-layer';

export type RadarFrame = { time: number; path: string };

export type RadarStatus =
  | { state: 'loading' }
  | {
      state: 'ready';
      label: string;
      frameTime: Date;
      // Animation controls -- lifted up to the panel (which owns the
      // play/pause/slider UI) the same way status itself is lifted, so the
      // panel never needs to touch the Mapbox instance directly. See
      // EnvironmentalMap.tsx's radar effect for the state machine these
      // close over.
      frameCount: number;
      frameIndex: number;
      playing: boolean;
      canAutoplay: boolean; // false under prefers-reduced-motion
      onPlayPause: () => void;
      onScrub: (frameIndex: number) => void;
      onJumpToLatest: () => void;
    }
  | { state: 'empty' }
  | { state: 'error'; message: string };

function firstSymbolLayerId(map: MapboxMap): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
}

export function removeRadarLayer(map: MapboxMap): void {
  if (map.getLayer(RAIN_LAYER_ID)) map.removeLayer(RAIN_LAYER_ID);
  if (map.getSource(RAIN_SOURCE_ID)) map.removeSource(RAIN_SOURCE_ID);
}

function frameTileUrl(host: string, frame: RadarFrame): string {
  // RainViewer's tile server doesn't serve tiles past z10 -- capped via
  // maxzoom on the source itself (see ensureRadarSource), which makes
  // Mapbox overzoom (upscale) the z10 tile instead of showing RainViewer's
  // own "Zoom Level Not Supported" placeholder.
  return `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

// Adds the radar raster source/layer if missing, otherwise just repoints
// the existing source at a new frame's tiles via setTiles() -- far cheaper
// than remove+re-add on every animation tick, and avoids a flash of no
// radar between frames.
export function applyRadarFrame(map: MapboxMap, host: string, frame: RadarFrame): void {
  const tileUrl = frameTileUrl(host, frame);
  const existing = map.getSource(RAIN_SOURCE_ID) as RasterTileSource | undefined;

  if (existing) {
    existing.setTiles([tileUrl]);
    return;
  }

  map.addSource(RAIN_SOURCE_ID, {
    type: 'raster',
    tiles: [tileUrl],
    tileSize: 256,
    maxzoom: 10,
    attribution: 'Radar © <a href="https://www.rainviewer.com" target="_blank" rel="noreferrer">RainViewer</a>',
  });
  // Insert below the first symbol (label) layer so place/road names stay
  // legible under the radar overlay instead of being washed out -- a plain
  // addLayer() with no beforeId stacks new layers above everything in the
  // current style, including labels.
  map.addLayer({ id: RAIN_LAYER_ID, type: 'raster', source: RAIN_SOURCE_ID, paint: { 'raster-opacity': 0.65 } }, firstSymbolLayerId(map));
}

export type RadarManifestResult =
  | { ok: true; host: string; frames: RadarFrame[] }
  | { ok: false; empty: true }
  | { ok: false; empty: false; message: string };

// RainViewer's public radar tile API -- keyless today, but isolated behind
// this module (not inlined into map lifecycle code) so it can be swapped
// for a licensed/authoritative source like NOAA MRMS later without
// touching the map shell or panel UI. Returns the full "past" frame
// history (observed radar only -- RainViewer's `nowcast` array is a short
// forecast extrapolation, deliberately not surfaced here so "radar
// animation" can't be mistaken for a precipitation forecast).
export async function fetchRadarManifest(signal: AbortSignal): Promise<RadarManifestResult> {
  let data: { host: string; radar: { past: RadarFrame[] } };
  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal });
    if (!response.ok) throw new Error(`RainViewer returned HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    if (signal.aborted) throw err;
    return { ok: false, empty: false, message: err instanceof Error ? err.message : 'Radar unavailable' };
  }

  const frames = data.radar?.past ?? [];
  if (frames.length === 0) return { ok: false, empty: true };
  return { ok: true, host: data.host, frames };
}
