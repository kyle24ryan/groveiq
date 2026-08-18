import { useMemo, useState } from 'react';
import { Card } from '../Card';
import { useUnits } from '../../contexts/UnitsContext';
import { formatTemp, tempUnit, formatWindSpeed, windSpeedUnit } from '../../lib/units';
import { aqiCategory } from '../../lib/aqi';
import type { ConditionsReading, RegionalAqi, ForecastDay } from '../../lib/api';
import { EnvironmentalMap } from './EnvironmentalMap';
import type { MarkerRow } from './GroveMarker';
import type { RadarStatus } from './layers/radarLayer';
import { LAYER_CATALOG, type MapLayerId } from './layerCatalog';

type EnvironmentalContextPanelProps = {
  latest: ConditionsReading | null;
  regionalAqi?: RegionalAqi | null;
  forecast?: ForecastDay[];
  freshnessLabel: string;
  compact?: boolean;
};

function compassLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Environmental context map (spec 7.2/7.3's "why here, why now?" panel,
// rebuilt 2026-08-17 against the Mapbox implementation brief). Purely
// environmental -- no per-tree insight/driver claims -- so it never
// presents a demo tree signal as though it were measured environmental
// correlation (that distinction is the brief's explicit acceptance
// criterion). Tree-specific priority framing stays in
// PriorityIntelligencePanel, a separate component scoped to that claim.
export function EnvironmentalContextPanel({ latest, regionalAqi, forecast, freshnessLabel, compact }: EnvironmentalContextPanelProps) {
  const { system } = useUnits();
  const [layer, setLayer] = useState<MapLayerId>('impact');
  const [radarStatus, setRadarStatus] = useState<RadarStatus>({ state: 'loading' });
  const windDirDeg = latest?.wind_dir_deg ?? null;
  const windMph = latest?.wind_mph ?? null;
  const localAqi = latest?.pm25_aqi ?? null;
  const frostDay = forecast?.find((d) => d.frost_risk === 1);

  const popupRows: MarkerRow[] = useMemo(() => {
    const tempRow = latest?.outdoor_temp_c != null ? `${formatTemp(latest.outdoor_temp_c, system)}${tempUnit(system)}` : '—';
    const windRow = windMph != null ? `${formatWindSpeed(windMph, system)} ${windSpeedUnit(system)}${windDirDeg != null ? ` ${compassLabel(windDirDeg)}` : ''}` : '—';
    const aqiRow = localAqi != null ? `${Math.round(localAqi)} · ${aqiCategory(localAqi).label}` : '—';
    return [
      { label: 'Temp', value: tempRow },
      { label: 'Wind', value: windRow },
      { label: 'AQI', value: aqiRow },
    ];
  }, [latest, windMph, windDirDeg, localAqi, system]);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span className="eyebrow">{compact ? 'Grove environment' : 'Environmental context'}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Map layer">
          {LAYER_CATALOG.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={layer === l.id}
              onClick={() => setLayer(l.id)}
              style={{
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: layer === l.id ? 'var(--ink)' : 'var(--surface)',
                color: layer === l.id ? 'var(--canvas)' : 'var(--ink-soft)',
                fontSize: 12.5,
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

      <EnvironmentalMap
        layer={layer}
        windDirDeg={windDirDeg}
        windMph={windMph}
        localAqi={localAqi}
        height={compact ? 260 : 320}
        popupTitle="Grove — current conditions"
        popupRows={popupRows}
        onRadarStatus={setRadarStatus}
      />

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        {layer === 'impact' && (
          <>
            <Row label="Wind" value={windDirDeg != null ? `${compassLabel(windDirDeg)} (${Math.round(windDirDeg)}°) ${windMph != null ? `${formatWindSpeed(windMph, system)} ${windSpeedUnit(system)}` : ''}` : '—'} />
            <Row label="Local AQI" value={localAqi != null ? `${Math.round(localAqi)} · ${aqiCategory(localAqi).label}` : '—'} />
            <Row label="Freshness" value={freshnessLabel} />
          </>
        )}

        {layer === 'wind' && (
          <>
            <Row label="Speed" value={windMph != null ? `${formatWindSpeed(windMph, system)} ${windSpeedUnit(system)}` : '—'} />
            <Row label="Direction" value={windDirDeg != null ? `${compassLabel(windDirDeg)} (${Math.round(windDirDeg)}°)` : '—'} />
            <Row label="Freshness" value={freshnessLabel} />
            <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
              {windMph == null
                ? 'Waiting on live wind data.'
                : windMph >= 25
                  ? 'High wind at the grove right now.'
                  : windMph >= 12
                    ? 'Elevated wind at the grove.'
                    : 'Low wind at the grove right now.'}{' '}
              A point reading at the grove, not a regional wind field.
            </p>
          </>
        )}

        {layer === 'air' && (
          <>
            <Row label="Local AQI" value={localAqi != null ? `${Math.round(localAqi)} · ${aqiCategory(localAqi).label}` : '—'} />
            <Row label="Local freshness" value={freshnessLabel} />
            <Row
              label="Regional AQI"
              value={regionalAqi?.airnow_aqi != null ? `${regionalAqi.airnow_aqi.toFixed(0)} · ${regionalAqi.airnow_category ?? ''}${regionalAqi.reporting_area ? ` (${regionalAqi.reporting_area})` : ''}` : 'Unavailable'}
            />
            {/* Regional AirNow updates on its own daily cadence, separate
                from the local sensor's ~5-min poll -- sharing one
                "Freshness" row between the two would misrepresent how
                current each value actually is. */}
            {regionalAqi?.ts && <Row label="Regional as of" value={new Date(regionalAqi.ts).toLocaleString()} />}
            <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>Point reading at the grove's own sensor, shown as a marker — not a regional smoke contour (no gridded dataset for that here).</p>
          </>
        )}

        {layer === 'precipitation' && (
          <>
            {radarStatus.state === 'loading' && <Row label="Source" value="Loading…" />}
            {radarStatus.state === 'error' && <Row label="Source" value={`Unavailable — ${radarStatus.message}`} />}
            {radarStatus.state === 'empty' && <Row label="Source" value="No radar frame available right now" />}
            {radarStatus.state === 'ready' && (
              <>
                <Row label="Source" value={radarStatus.label} />
                <Row label="Radar time" value={radarStatus.frameTime.toLocaleTimeString()} />
              </>
            )}
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
    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', color: 'var(--ink-soft)', gap: '2px 12px' }}>
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span className="mono" style={{ textAlign: 'right', minWidth: 0, wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  );
}
