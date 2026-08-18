import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { GROVE_LAT, GROVE_LON } from '../../lib/location';
import { createGroveMarker, updateGroveMarkerPopup, type MarkerRow } from './GroveMarker';
import { fetchRadarManifest, applyRadarFrame, removeRadarLayer, type RadarStatus, type RadarFrame } from './layers/radarLayer';
import { loadAlertsLayer, removeAlertsLayer, type AlertsStatus } from './layers/stormsAlertsLayer';
import { loadPurpleAirLayer, removePurpleAirLayer, type PurpleAirStatus } from './layers/purpleAirLayer';
import { loadFirmsLayer, removeFirmsLayer, type FirmsStatus } from './layers/firmsLayer';
import { loadSmokeLayer, removeSmokeLayer, type SmokeStatus } from './layers/smokeLayer';
import {
  syncAqiRing,
  removeAqiRing,
  ensureWindParticleLayer,
  removeWindParticleLayer,
  windParticleFeatures,
  windParticleProgress,
} from './layers/localConditionsLayer';
import type { MapLayerId } from './layerCatalog';

type EnvironmentalMapProps = {
  layer: MapLayerId;
  windDirDeg?: number | null;
  windMph?: number | null;
  localAqi?: number | null;
  height?: number;
  popupTitle: string;
  popupRows: MarkerRow[];
  onRadarStatus?: (status: RadarStatus) => void;
  onAlertsStatus?: (status: AlertsStatus) => void;
  onPurpleAirStatus?: (status: PurpleAirStatus) => void;
  onFirmsStatus?: (status: FirmsStatus) => void;
  onSmokeStatus?: (status: SmokeStatus) => void;
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Radar animation steps roughly every 2 past-frames-per-second -- brisk
// enough to read as motion, slow enough that individual frames (and their
// timestamps, shown in the panel) stay legible.
const RADAR_FRAME_INTERVAL_MS = 700;

function mapStyleForScheme(isDark: boolean): string {
  return isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
}

// Mapbox lifecycle only -- init, style/theme changes, cleanup, and
// delegating layer-specific rendering to layers/*. Provider fetches and
// domain logic (what a wind particle's color means, how radar status is
// worded, NWS/PurpleAir/FIRMS/HMS fetch+normalize) live outside this
// component; see layers/*.ts.
export function EnvironmentalMap({
  layer,
  windDirDeg,
  windMph,
  localAqi,
  height = 260,
  popupTitle,
  popupRows,
  onRadarStatus,
  onAlertsStatus,
  onPurpleAirStatus,
  onFirmsStatus,
  onSmokeStatus,
}: EnvironmentalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const groveMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const windMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [styleLoaded, setStyleLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyleForScheme(darkSchemeQuery.matches),
      center: [GROVE_LON, GROVE_LAT],
      zoom: 10.5,
      interactive: true,
      attributionControl: true,
    });
    map.on('error', (e) => {
      console.error('EnvironmentalMap:', e.error ?? e);
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    map.on('style.load', () => setStyleLoaded(true));

    groveMarkerRef.current = createGroveMarker(map, [GROVE_LON, GROVE_LAT], 'Grove location — activate for current conditions');

    // The rest of the app follows the OS's prefers-color-scheme live (pure
    // CSS, no toggle) -- match that here rather than freezing the map's
    // style at whatever the scheme was on mount. setStyle() re-fires
    // 'style.load', so layer effects below (gated on styleLoaded) re-add
    // their sources/layers automatically; the markers are separate DOM
    // overlays and survive a style change untouched.
    const handleSchemeChange = (e: MediaQueryListEvent) => {
      setStyleLoaded(false);
      map.setStyle(mapStyleForScheme(e.matches));
    };
    darkSchemeQuery.addEventListener('change', handleSchemeChange);

    mapRef.current = map;
    return () => {
      darkSchemeQuery.removeEventListener('change', handleSchemeChange);
      map.remove();
      mapRef.current = null;
      groveMarkerRef.current = null;
      windMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the grove popup's content current as live conditions update.
  useEffect(() => {
    if (!groveMarkerRef.current) return;
    updateGroveMarkerPopup(groveMarkerRef.current, popupTitle, popupRows);
  }, [popupTitle, popupRows]);

  // Wind direction arrow: shown for "impact" (tied to whatever the active
  // priority signal cares about) and always for "wind".
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const showArrow = (layer === 'impact' || layer === 'wind') && windDirDeg != null;

    if (!showArrow) {
      windMarkerRef.current?.remove();
      windMarkerRef.current = null;
      return;
    }

    if (!windMarkerRef.current) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#5B5BD6;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.2));z-index:3;position:relative;';
      el.textContent = '↑';
      windMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([GROVE_LON, GROVE_LAT]).addTo(map);
    }
    windMarkerRef.current.setRotation(windDirDeg! + 180);
  }, [layer, windDirDeg]);

  // Local AQI ring ("air & fire" layer only).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (layer !== 'airFire') {
      removeAqiRing(map);
      return;
    }
    syncAqiRing(map, true, localAqi ?? null);
  }, [layer, localAqi, styleLoaded]);

  // Wind particle stream ("wind" layer only). Respects
  // prefers-reduced-motion by rendering fixed, evenly spaced positions
  // instead of animating.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    if (layer !== 'wind' || windDirDeg == null) {
      removeWindParticleLayer(map);
      return;
    }

    ensureWindParticleLayer(map, windMph ?? null);
    const source = () => map.getSource('grove-wind-particles') as mapboxgl.GeoJSONSource | undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const count = 7;
      source()?.setData({
        type: 'FeatureCollection',
        features: windParticleFeatures(windDirDeg, windMph ?? null, (i) => i / count),
      });
      return () => removeWindParticleLayer(map);
    }

    let rafId: number;
    const startedAt = performance.now();
    const frame = () => {
      const elapsed = performance.now() - startedAt;
      source()?.setData({
        type: 'FeatureCollection',
        features: windParticleFeatures(windDirDeg, windMph ?? null, (i) => windParticleProgress(i, elapsed)),
      });
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      removeWindParticleLayer(map);
    };
  }, [layer, windDirDeg, windMph, styleLoaded]);

  // Precipitation radar + frame animation ("storms" layer only). Aborts
  // the fetch on cleanup so a fast layer switch can't apply a stale
  // response. Defaults to the latest frame; play/pause/scrub controls are
  // lifted to the panel via onRadarStatus, same pattern as the plain
  // status used to be lifted (see layers/radarLayer.ts's RadarStatus).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (layer !== 'storms') {
      removeRadarLayer(map);
      onRadarStatus?.({ state: 'empty' });
      return;
    }

    const controller = new AbortController();
    let manifest: { host: string; frames: RadarFrame[] } | null = null;
    let frameIndex = 0;
    let playing = false;
    let intervalId: number | undefined;
    const canAutoplay = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const stopInterval = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const publish = () => {
      if (!manifest) return;
      onRadarStatus?.({
        state: 'ready',
        label: 'RainViewer radar',
        frameTime: new Date(manifest.frames[frameIndex].time * 1000),
        frameCount: manifest.frames.length,
        frameIndex,
        playing,
        canAutoplay,
        onPlayPause: () => {
          if (!canAutoplay) return;
          playing = !playing;
          if (playing) startInterval();
          else stopInterval();
          publish();
        },
        onScrub: (i: number) => {
          if (!manifest) return;
          stopInterval();
          playing = false;
          frameIndex = Math.max(0, Math.min(manifest.frames.length - 1, i));
          applyRadarFrame(map, manifest.host, manifest.frames[frameIndex]);
          publish();
        },
        onJumpToLatest: () => {
          if (!manifest) return;
          stopInterval();
          playing = false;
          frameIndex = manifest.frames.length - 1;
          applyRadarFrame(map, manifest.host, manifest.frames[frameIndex]);
          publish();
        },
      });
    };

    function startInterval() {
      stopInterval();
      intervalId = window.setInterval(() => {
        if (!manifest) return;
        frameIndex = (frameIndex + 1) % manifest.frames.length;
        applyRadarFrame(map!, manifest.host, manifest.frames[frameIndex]);
        publish();
      }, RADAR_FRAME_INTERVAL_MS);
    }

    onRadarStatus?.({ state: 'loading' });
    fetchRadarManifest(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          onRadarStatus?.(result.empty ? { state: 'empty' } : { state: 'error', message: result.message });
          return;
        }
        manifest = { host: result.host, frames: result.frames };
        frameIndex = manifest.frames.length - 1; // default to latest frame, not autoplaying
        applyRadarFrame(map, manifest.host, manifest.frames[frameIndex]);
        publish();
      })
      .catch(() => {
        // fetchRadarManifest only rejects on AbortController abort; nothing
        // to report, cleanup below handles it.
      });

    return () => {
      controller.abort();
      stopInterval();
      removeRadarLayer(map);
    };
  }, [layer, styleLoaded, onRadarStatus]);

  // NWS active weather alerts ("storms" layer only) -- polygon geometry
  // when the alert has one, otherwise the panel lists it as text-only.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (layer !== 'storms') {
      removeAlertsLayer(map);
      return;
    }
    const controller = new AbortController();
    loadAlertsLayer(map, controller.signal, (status) => onAlertsStatus?.(status));
    return () => {
      controller.abort();
      removeAlertsLayer(map);
    };
  }, [layer, styleLoaded, onAlertsStatus]);

  // PurpleAir nearby community sensors ("air & fire" layer only).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (layer !== 'airFire') {
      removePurpleAirLayer(map);
      return;
    }
    const controller = new AbortController();
    loadPurpleAirLayer(map, controller.signal, (status) => onPurpleAirStatus?.(status));
    return () => {
      controller.abort();
      removePurpleAirLayer(map);
    };
  }, [layer, styleLoaded, onPurpleAirStatus]);

  // NASA FIRMS detected hotspots ("air & fire" layer only), clustered.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (layer !== 'airFire') {
      removeFirmsLayer(map);
      return;
    }
    const controller = new AbortController();
    loadFirmsLayer(map, controller.signal, (status) => onFirmsStatus?.(status));
    return () => {
      controller.abort();
      removeFirmsLayer(map);
    };
  }, [layer, styleLoaded, onFirmsStatus]);

  // NOAA HMS observed smoke plumes ("air & fire" layer only).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (layer !== 'airFire') {
      removeSmokeLayer(map);
      return;
    }
    const controller = new AbortController();
    loadSmokeLayer(map, controller.signal, (status) => onSmokeStatus?.(status));
    return () => {
      controller.abort();
      removeSmokeLayer(map);
    };
  }, [layer, styleLoaded, onSmokeStatus]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--canvas)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--ink-faint)',
          fontSize: 12.5,
          textAlign: 'center',
          padding: 16,
        }}
      >
        Map unavailable — VITE_MAPBOX_TOKEN not configured
      </div>
    );
  }

  const ariaLabel =
    layer === 'storms'
      ? 'Map centered on the grove in North Bend, WA, showing regional radar precipitation and active NWS weather alerts'
      : layer === 'wind'
        ? `Map centered on the grove, showing wind at the grove${windMph != null ? ` at ${windMph} mph` : ''}${windDirDeg != null ? ` from ${Math.round(windDirDeg)} degrees` : ''}`
        : layer === 'airFire'
          ? `Map centered on the grove, showing local air quality${localAqi != null ? ` at AQI ${Math.round(localAqi)}` : ''}, nearby PurpleAir community sensors, detected fire hotspots, and observed smoke plumes`
          : `Map centered on the grove in North Bend, WA${windDirDeg != null ? `, wind from ${Math.round(windDirDeg)} degrees${windMph != null ? ` at ${windMph} mph` : ''}` : ''}`;

  // role="region" (not "img") so the marker button and map controls stay
  // reachable by assistive technology instead of being hidden as
  // decorative image content.
  return <div ref={containerRef} role="region" aria-label={ariaLabel} style={{ height, borderRadius: 8, overflow: 'hidden' }} />;
}
