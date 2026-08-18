import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Feature, Point } from 'geojson';
import { GROVE_LAT, GROVE_LON } from '../../lib/location';
import { aqiCategory } from '../../lib/aqi';

export type MapLayer = 'impact' | 'precipitation' | 'wind' | 'air';

type GroveMapProps = {
  layer: MapLayer;
  windDirDeg?: number | null;
  windMph?: number | null;
  localAqi?: number | null;
  height?: number;
  onSourceInfo?: (info: { label: string; freshness: string | null } | null) => void;
  /** Pre-formatted HTML for the grove marker's click popup -- built by the
   * parent since it already has unit-system-aware formatting helpers in
   * scope; this component stays presentation-only. */
  popupHtml?: string;
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const RAIN_SOURCE_ID = 'rainviewer-radar';
const RAIN_LAYER_ID = 'rainviewer-radar-layer';
const IMPACT_RING_SOURCE_ID = 'grove-impact-ring';
const IMPACT_RING_LAYER_ID = 'grove-impact-ring-layer';
const WIND_PARTICLE_SOURCE_ID = 'grove-wind-particles';
const WIND_PARTICLE_LAYER_ID = 'grove-wind-particles-layer';
const WIND_PARTICLE_COUNT = 7;
const WIND_PARTICLE_LIFE_MS = 2200;

function ringColorForWind(mph: number | null | undefined): string {
  if (mph == null) return '#9CA3AF';
  if (mph >= 25) return '#B91C1C';
  if (mph >= 12) return '#B45309';
  return '#2F6D4F';
}

function ringColorForAqi(aqi: number | null | undefined): string {
  if (aqi == null) return '#9CA3AF';
  const status = aqiCategory(aqi).status;
  return status === 'urgent' ? '#B91C1C' : status === 'watch' ? '#B45309' : '#2F6D4F';
}

function mapStyleForScheme(isDark: boolean): string {
  return isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11';
}

// Native GroveIQ map shell (spec 7.2's "why here, why now?" panel) with a
// real layer switcher (spec 7.3). Only "Precipitation" uses a genuine
// gridded overlay (RainViewer's public, keyless radar tile API) -- the
// repo has a single point location and point-in-time readings for
// wind/AQI, not a gridded regional dataset for those, so per spec 6.3's
// "critical data limitation" section, "Air & smoke" renders as an
// interpretive colored ring and "Wind exposure" as an animated particle
// stream, both anchored to the grove marker (real point data, honestly
// presented as a point) rather than an invented regional contour. Full
// provider layer switching (Windy/PurpleAir) stays in Environment's
// "Regional source maps" disclosure.
export function GroveMap({ layer, windDirDeg, windMph, localAqi, height = 260, onSourceInfo, popupHtml }: GroveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const windMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const groveMarkerRef = useRef<mapboxgl.Marker | null>(null);
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
      console.error('GroveMap:', e.error ?? e);
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    map.on('style.load', () => setStyleLoaded(true));

    const groveEl = document.createElement('div');
    groveEl.setAttribute('aria-label', 'Grove location — click for current conditions');
    groveEl.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#2F6D4F;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.15);z-index:2;position:relative;cursor:pointer;';
    const groveMarker = new mapboxgl.Marker({ element: groveEl })
      .setLngLat([GROVE_LON, GROVE_LAT])
      .setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false, maxWidth: '220px' }))
      .addTo(map);
    groveMarkerRef.current = groveMarker;

    // The rest of the app follows the OS's prefers-color-scheme live (pure
    // CSS, no toggle) -- match that here rather than freezing the map's
    // style at whatever the scheme was on mount. setStyle() re-fires
    // 'style.load', so the ring/radar layers (gated on styleLoaded) get
    // re-added automatically; the marker is a separate DOM overlay and
    // survives a style change untouched.
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the popup's content current as live conditions update -- built by
  // the parent (unit-system-aware formatting already lives there) rather
  // than duplicating that logic in this presentation-only component.
  useEffect(() => {
    groveMarkerRef.current?.getPopup()?.setHTML(popupHtml ?? 'No live conditions yet.');
  }, [popupHtml]);

  // Wind vector marker: shown for the "impact" layer (tied to whatever
  // the active priority signal cares about) and always for "wind".
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
      el.style.cssText = 'width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#5B5BD6;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.2));z-index:3;position:relative;';
      el.textContent = '↑';
      windMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([GROVE_LON, GROVE_LAT]).addTo(map);
    }
    // Wind direction is "from" (meteorological convention); rotate the
    // arrow to point where the wind is blowing toward.
    windMarkerRef.current.setRotation(windDirDeg! + 180);
  }, [layer, windDirDeg]);

  // Impact ring: a colored circle around the grove marker for the "air"
  // layer, sized/colored from the real point AQI reading at the grove.
  // ("wind" used to share this ring too; it now gets the animated particle
  // stream below instead, which conveys direction/speed better.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    const removeRing = () => {
      if (map.getLayer(IMPACT_RING_LAYER_ID)) map.removeLayer(IMPACT_RING_LAYER_ID);
      if (map.getSource(IMPACT_RING_SOURCE_ID)) map.removeSource(IMPACT_RING_SOURCE_ID);
    };

    if (layer !== 'air') {
      removeRing();
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

    return () => {
      // Only tear down on unmount/layer-change cleanup, not every paint tweak.
    };
  }, [layer, localAqi, styleLoaded]);

  // Wind particle stream: small dots animate outward from the grove marker
  // along the live wind direction, fading as they travel. This is a
  // stylized indicator, not a to-scale simulation -- like the AQI ring, it
  // deliberately stays anchored to the grove's single point reading rather
  // than implying a gridded regional flow field we don't have data for
  // (see this file's top comment on the "critical data limitation").
  // Distance traveled scales loosely with wind speed so calm vs. gusty
  // reads as visually distinct, not to convey real-world scale.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    const removeParticles = () => {
      if (map.getLayer(WIND_PARTICLE_LAYER_ID)) map.removeLayer(WIND_PARTICLE_LAYER_ID);
      if (map.getSource(WIND_PARTICLE_SOURCE_ID)) map.removeSource(WIND_PARTICLE_SOURCE_ID);
    };

    if (layer !== 'wind' || windDirDeg == null) {
      removeParticles();
      return;
    }

    const color = ringColorForWind(windMph);
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    // Wind direction is "from" (met convention); particles travel toward
    // where the wind is blowing, same convention as the arrow marker above.
    const bearingRad = toRad(windDirDeg + 180);
    const dx = Math.sin(bearingRad);
    const dy = Math.cos(bearingRad);
    const latCos = Math.cos(toRad(GROVE_LAT));
    const maxOffsetDeg = 0.0018 + Math.min(windMph ?? 0, 40) * 0.00006;

    const emptyGeojson = { type: 'FeatureCollection' as const, features: [] as Feature<Point>[] };
    map.addSource(WIND_PARTICLE_SOURCE_ID, { type: 'geojson', data: emptyGeojson });
    map.addLayer({
      id: WIND_PARTICLE_LAYER_ID,
      type: 'circle',
      source: WIND_PARTICLE_SOURCE_ID,
      paint: {
        'circle-radius': 4,
        'circle-color': color,
        'circle-opacity': ['get', 'opacity'],
      },
    });

    const featuresAt = (progressForIndex: (i: number) => number): Feature<Point>[] =>
      Array.from({ length: WIND_PARTICLE_COUNT }, (_, i) => {
        const t = progressForIndex(i);
        const dist = maxOffsetDeg * t;
        const lon = GROVE_LON + (dx * dist) / (latCos || 1);
        const lat = GROVE_LAT + dy * dist;
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lon, lat] },
          properties: { opacity: 0.7 * (1 - t) },
        };
      });

    const source = () => map.getSource(WIND_PARTICLE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;

    // Respect prefers-reduced-motion: show the particles at fixed, evenly
    // spaced positions instead of continuously animating.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      source()?.setData({ type: 'FeatureCollection', features: featuresAt((i) => i / WIND_PARTICLE_COUNT) });
      return removeParticles;
    }

    let rafId: number;
    const startedAt = performance.now();
    const frame = () => {
      const now = performance.now();
      const features = featuresAt((i) => {
        // Stagger each particle's phase so they form a continuous stream
        // rather than all pulsing in lockstep.
        const phaseOffsetMs = (WIND_PARTICLE_LIFE_MS / WIND_PARTICLE_COUNT) * i;
        const age = (now - startedAt + phaseOffsetMs) % WIND_PARTICLE_LIFE_MS;
        return age / WIND_PARTICLE_LIFE_MS; // 0 (at grove) -> 1 (fully traveled)
      });
      source()?.setData({ type: 'FeatureCollection', features });
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      removeParticles();
    };
  }, [layer, windDirDeg, windMph, styleLoaded]);

  // Precipitation: RainViewer's public radar tile API (no key required).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    const removeRadar = () => {
      if (map.getLayer(RAIN_LAYER_ID)) map.removeLayer(RAIN_LAYER_ID);
      if (map.getSource(RAIN_SOURCE_ID)) map.removeSource(RAIN_SOURCE_ID);
    };

    if (layer !== 'precipitation') {
      removeRadar();
      onSourceInfo?.(null);
      return;
    }

    let cancelled = false;
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then((r) => r.json())
      .then((data: { host: string; radar: { past: { time: number; path: string }[] } }) => {
        if (cancelled) return;
        const latest = data.radar.past[data.radar.past.length - 1];
        if (!latest) return;
        const tileUrl = `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
        removeRadar();
        map.addSource(RAIN_SOURCE_ID, { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution: 'Radar © <a href="https://www.rainviewer.com" target="_blank" rel="noreferrer">RainViewer</a>' });
        map.addLayer({ id: RAIN_LAYER_ID, type: 'raster', source: RAIN_SOURCE_ID, paint: { 'raster-opacity': 0.65 } });
        onSourceInfo?.({ label: 'RainViewer radar', freshness: new Date(latest.time * 1000).toLocaleTimeString() });
      })
      .catch(() => {
        onSourceInfo?.({ label: 'RainViewer radar unavailable', freshness: null });
      });

    return () => {
      cancelled = true;
    };
  }, [layer, styleLoaded, onSourceInfo]);

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
        ? `Map centered on the grove, showing wind exposure${windMph != null ? ` at ${windMph} mph` : ''}${windDirDeg != null ? ` from ${Math.round(windDirDeg)} degrees` : ''}`
        : layer === 'air'
          ? `Map centered on the grove, showing local air quality${localAqi != null ? ` at AQI ${Math.round(localAqi)}` : ''}`
          : `Map centered on the grove in North Bend, WA${windDirDeg != null ? `, wind from ${Math.round(windDirDeg)} degrees${windMph != null ? ` at ${windMph} mph` : ''}` : ''}`;

  return <div ref={containerRef} role="img" aria-label={ariaLabel} style={{ height, borderRadius: 8, overflow: 'hidden' }} />;
}
