import { useState } from 'react';
import { Card } from './Card';
import { GROVE_LAT, GROVE_LON } from '../lib/location';

type MapTab = 'windy' | 'purpleair';

// Windy's free embed widget (no API key) -- ships its own layer picker for
// wind, rain/precipitation, temperature, clouds, pressure, and more, so
// switching layers happens inside the embed itself rather than needing
// separate iframes per layer.
function windyUrl(): string {
  const params = new URLSearchParams({
    lat: String(GROVE_LAT),
    lon: String(GROVE_LON),
    detailLat: String(GROVE_LAT),
    detailLon: String(GROVE_LON),
    zoom: '9',
    level: 'surface',
    overlay: 'wind',
    product: 'ecmwf',
    menu: '',
    message: 'true',
    marker: 'true',
    calendar: 'now',
    type: 'map',
    location: 'coordinates',
    metricWind: 'mph',
    metricTemp: 'default',
    radarRange: '-1',
  });
  return `https://embed.windy.com/embed2.html?${params.toString()}`;
}

// PurpleAir's public sensor-network map -- the standard PNW
// wildfire-smoke-tracking map, crowdsourced real-time PM2.5. AirNow's own
// map (fire.airnow.gov) sends X-Frame-Options: DENY and can't be embedded;
// PurpleAir's doesn't block framing.
function purpleAirUrl(): string {
  return `https://map.purpleair.com/1/mAQI/a10/p604800/cC0#9/${GROVE_LAT}/${GROVE_LON}`;
}

export function RegionalMaps() {
  const [tab, setTab] = useState<MapTab>('windy');

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, padding: '14px 16px 0' }}>
        {(
          [
            { key: 'windy', label: 'Wind & precipitation' },
            { key: 'purpleair', label: 'Air quality & smoke' },
          ] as { key: MapTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 12px',
              borderRadius: '999px 999px 0 0',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--insight)' : '2px solid transparent',
              background: 'transparent',
              color: tab === t.key ? 'var(--ink)' : 'var(--ink-soft)',
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10' }}>
        {tab === 'windy' ? (
          <iframe
            key="windy"
            title="Windy — wind and precipitation map"
            src={windyUrl()}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            loading="lazy"
          />
        ) : (
          <iframe
            key="purpleair"
            title="PurpleAir — air quality and smoke map"
            src={purpleAirUrl()}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            loading="lazy"
          />
        )}
      </div>
    </Card>
  );
}
