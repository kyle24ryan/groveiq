import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { GROVE_LAT, GROVE_LON } from '../../lib/location';

type GroveMapProps = {
  windDirDeg?: number | null;
  windMph?: number | null;
  height?: number;
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Native GroveIQ map shell (spec 7.2/section 6.3's "why here, why now"
// panel): grove marker + a directional wind vector are the only overlays,
// deliberately -- the repo has a single point location and point-in-time
// readings, not a gridded regional dataset, so spec 6.3's "critical data
// limitation" section forbids inventing a regional heat/precip contour
// here. Real gridded layers (wind field, precip, smoke) stay in the
// provider embeds under Environment's "Regional source maps" section.
export function GroveMap({ windDirDeg, windMph, height = 260 }: GroveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const windMarkerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [GROVE_LON, GROVE_LAT],
      zoom: 10.5,
      interactive: true,
      attributionControl: true,
    });
    map.on('error', (e) => {
      console.error('GroveMap:', e.error ?? e);
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    const groveEl = document.createElement('div');
    groveEl.setAttribute('aria-label', 'Grove location');
    groveEl.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#2F6D4F;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.15);';
    new mapboxgl.Marker({ element: groveEl }).setLngLat([GROVE_LON, GROVE_LAT]).addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (windDirDeg == null) {
      windMarkerRef.current?.remove();
      windMarkerRef.current = null;
      return;
    }

    if (!windMarkerRef.current) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#5B5BD6;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.2));';
      el.textContent = '↑';
      windMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([GROVE_LON, GROVE_LAT]).addTo(map);
    }
    // Wind direction is "from" (meteorological convention); rotate the
    // arrow to point where the wind is blowing toward.
    const el = windMarkerRef.current.getElement();
    el.style.transform = `${el.style.transform.replace(/rotate\([^)]*\)/, '')} rotate(${windDirDeg + 180}deg)`;
    windMarkerRef.current.setRotation(windDirDeg + 180);
  }, [windDirDeg]);

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

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Map centered on the grove in North Bend, WA${windDirDeg != null ? `, wind from ${Math.round(windDirDeg)} degrees${windMph != null ? ` at ${windMph} mph` : ''}` : ''}`}
      style={{ height, borderRadius: 8, overflow: 'hidden' }}
    />
  );
}
