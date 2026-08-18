import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { GROVE_LAT, GROVE_LON } from '../../lib/location';
import { createGroveMarker, updateGroveMarkerPopup, type MarkerRow } from './GroveMarker';
import { loadRadarLayer, removeRadarLayer, type RadarStatus } from './layers/radarLayer';
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
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

function mapStyleForScheme(isDark: boolean): string {
  return isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
}

// Mapbox lifecycle only -- init, style/theme changes, cleanup, and
// delegating layer-specific rendering to layers/*. Provider fetches and
// domain logic (what a wind particle's color means, how radar status is
// worded) live outside this component; see layers/radarLayer.ts and
// layers/localConditionsLayer.ts.
export function EnvironmentalMap({ layer, windDirDeg, windMph, localAqi, height = 260, popupTitle, popupRows, onRadarStatus }: EnvironmentalMapProps) {
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

  // Local AQI ring ("air" layer only).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (layer !== 'air') {
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

  // Precipitation radar ("precipitation" layer only). Aborts the fetch on
  // cleanup so a fast layer switch can't apply a stale response.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (layer !== 'precipitation') {
      removeRadarLayer(map);
      onRadarStatus?.({ state: 'empty' });
      return;
    }

    const controller = new AbortController();
    loadRadarLayer(map, controller.signal, (status) => onRadarStatus?.(status));
    return () => controller.abort();
  }, [layer, styleLoaded, onRadarStatus]);

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
    layer === 'precipitation'
      ? 'Map centered on the grove in North Bend, WA, showing regional radar precipitation'
      : layer === 'wind'
        ? `Map centered on the grove, showing wind at the grove${windMph != null ? ` at ${windMph} mph` : ''}${windDirDeg != null ? ` from ${Math.round(windDirDeg)} degrees` : ''}`
        : layer === 'air'
          ? `Map centered on the grove, showing local air quality${localAqi != null ? ` at AQI ${Math.round(localAqi)}` : ''}`
          : `Map centered on the grove in North Bend, WA${windDirDeg != null ? `, wind from ${Math.round(windDirDeg)} degrees${windMph != null ? ` at ${windMph} mph` : ''}` : ''}`;

  // role="region" (not "img") so the marker button and map controls stay
  // reachable by assistive technology instead of being hidden as
  // decorative image content.
  return <div ref={containerRef} role="region" aria-label={ariaLabel} style={{ height, borderRadius: 8, overflow: 'hidden' }} />;
}
