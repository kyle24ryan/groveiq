import { lazy, Suspense, useState, useMemo } from 'react';
import { Card } from '../Card';
import { useUnits } from '../../contexts/UnitsContext';
import { formatTemp, tempUnit, formatWindSpeed, windSpeedUnit } from '../../lib/units';
import { aqiCategory } from '../../lib/aqi';
import type { Insight, Tree } from '../../data/types';
import type { ConditionsReading, RegionalAqi, ForecastDay } from '../../lib/api';
import type { MapLayer } from './GroveMap';

type SpatialEvidencePanelProps = {
  insight: Insight;
  tree?: Tree;
  latest: ConditionsReading | null;
  regionalAqi?: RegionalAqi | null;
  forecast?: ForecastDay[];
  freshnessLabel: string;
};

// Mapbox GL JS is ~700KB gzipped -- code-split so it only loads when this
// panel actually renders (spec 18: "lazy-load the native mapping library
// if ... bundle impact is significant"), not bundled into every route.
const GroveMap = lazy(() => import('./GroveMap').then((m) => ({ default: m.GroveMap })));

function compassLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

const layers: { key: MapLayer; label: string }[] = [
  { key: 'impact', label: 'Grove impact' },
  { key: 'wind', label: 'Wind exposure' },
  { key: 'air', label: 'Air & smoke' },
  { key: 'precipitation', label: 'Precipitation' },
];

// "Why here, why now?" (spec 6.3) with a real layer switcher (spec 7.3):
// switching layers updates the overlay, the summary rows below it, and
// the source/freshness line together, per spec's "when a layer is
// selected, update all of the following together" requirement.
export function SpatialEvidencePanel({ insight, tree, latest, regionalAqi, forecast, freshnessLabel }: SpatialEvidencePanelProps) {
  const { system } = useUnits();
  const [layer, setLayer] = useState<MapLayer>('impact');
  const [radarInfo, setRadarInfo] = useState<{ label: string; freshness: string | null } | null>(null);
  const windDirDeg = latest?.wind_dir_deg ?? null;
  const windMph = latest?.wind_mph ?? null;
  const localAqi = latest?.pm25_aqi ?? null;
  const frostDay = forecast?.find((d) => d.frost_risk === 1);

  // Click-popup content for the grove marker -- a quick-glance dashboard
  // rather than requiring a layer switch just to see current conditions.
  // Kept to exactly temp/wind/AQI (no freshness line): the grove marker is
  // always dead-center on the map (it's the map's fixed center point), so
  // the popup only has ~height/2 of vertical room below it before hitting
  // the map card's rounded-corner overflow:hidden edge -- a 4th line
  // measured out to clip there in testing.
  const popupHtml = useMemo(() => {
    const tempRow = latest?.outdoor_temp_c != null ? `${formatTemp(latest.outdoor_temp_c, system)}${tempUnit(system)}` : '—';
    const windRow = windMph != null ? `${formatWindSpeed(windMph, system)} ${windSpeedUnit(system)}${windDirDeg != null ? ` ${compassLabel(windDirDeg)}` : ''}` : '—';
    const aqiRow = localAqi != null ? `${Math.round(localAqi)} · ${aqiCategory(localAqi).label}` : '—';
    return (
      `<div style="font-size:12.5px;min-width:140px;">` +
      `<div style="font-weight:600;margin-bottom:6px;">Grove — current conditions</div>` +
      `<div style="display:flex;justify-content:space-between;gap:10px;"><span>Temp</span><span>${tempRow}</span></div>` +
      `<div style="display:flex;justify-content:space-between;gap:10px;"><span>Wind</span><span>${windRow}</span></div>` +
      `<div style="display:flex;justify-content:space-between;gap:10px;"><span>AQI</span><span>${aqiRow}</span></div>` +
      `</div>`
    );
  }, [latest, windMph, windDirDeg, localAqi, system]);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span className="eyebrow">Why here, why now?</span>
        <div style={{ display: 'flex', gap: 4 }} role="tablist" aria-label="Map layer">
          {layers.map((l) => (
            <button
              key={l.key}
              role="tab"
              aria-selected={layer === l.key}
              aria-pressed={layer === l.key}
              onClick={() => setLayer(l.key)}
              style={{
                padding: '4px 9px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: layer === l.key ? 'var(--ink)' : 'var(--surface)',
                color: layer === l.key ? 'var(--canvas)' : 'var(--ink-soft)',
                fontSize: 11.5,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<div style={{ height: 260, background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 8 }} />}>
        <GroveMap layer={layer} windDirDeg={windDirDeg} windMph={windMph} localAqi={localAqi} onSourceInfo={setRadarInfo} popupHtml={popupHtml} />
      </Suspense>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        {layer === 'impact' && (
          <>
            <Row label="Wind" value={windDirDeg != null ? `${compassLabel(windDirDeg)} (${Math.round(windDirDeg)}°) ${windMph != null ? `${formatWindSpeed(windMph, system)} ${windSpeedUnit(system)}` : ''}` : '—'} />
            <Row label="Affected" value={tree ? tree.name : 'Whole grove'} />
            <Row label="Freshness" value={freshnessLabel} />
            {insight.driver && (
              <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
                {insight.driver.relationship === 'correlated' ? 'Correlated with' : 'Likely driven by'} {insight.driver.label.toLowerCase()} at the grove's location.
              </p>
            )}
          </>
        )}

        {layer === 'wind' && (
          <>
            <Row label="Speed" value={windMph != null ? `${formatWindSpeed(windMph, system)} ${windSpeedUnit(system)}` : '—'} />
            <Row label="Direction" value={windDirDeg != null ? `${compassLabel(windDirDeg)} (${Math.round(windDirDeg)}°)` : '—'} />
            <Row label="Freshness" value={freshnessLabel} />
            <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
              {windMph == null ? 'Waiting on live wind data.' : windMph >= 25 ? 'High wind exposure at the grove right now.' : windMph >= 12 ? 'Elevated wind exposure at the grove.' : 'Low wind exposure at the grove right now.'}
            </p>
          </>
        )}

        {layer === 'air' && (
          <>
            <Row label="Local AQI" value={localAqi != null ? `${Math.round(localAqi)} · ${aqiCategory(localAqi).label}` : '—'} />
            <Row label="Regional AQI" value={regionalAqi?.airnow_aqi != null ? `${regionalAqi.airnow_aqi.toFixed(0)} · ${regionalAqi.airnow_category ?? ''}${regionalAqi.reporting_area ? ` (${regionalAqi.reporting_area})` : ''}` : 'Unavailable'} />
            <Row label="Freshness" value={freshnessLabel} />
            <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>Point reading at the grove's own sensor, shown as a marker — not a regional smoke contour (no gridded dataset for that here).</p>
          </>
        )}

        {layer === 'precipitation' && (
          <>
            <Row label="Source" value={radarInfo?.label ?? 'Loading…'} />
            <Row label="Radar time" value={radarInfo?.freshness ?? '—'} />
            <Row label="Frost risk" value={frostDay ? `${frostDay.date} (7-day forecast)` : 'None in the 7-day forecast'} />
            <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
              Public regional radar (RainViewer) — attribution shown on the map. Local rain-gauge reading is on the Environment page.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)', gap: 12 }}>
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span className="mono" style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}
