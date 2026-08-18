import { useMemo, useState } from 'react';
import { Card } from '../Card';
import { useUnits } from '../../contexts/UnitsContext';
import { formatTemp, tempUnit, formatWindSpeed, windSpeedUnit } from '../../lib/units';
import { aqiCategory } from '../../lib/aqi';
import type { ConditionsReading, RegionalAqi, ForecastDay } from '../../lib/api';
import { EnvironmentalMap } from './EnvironmentalMap';
import type { MarkerRow } from './GroveMarker';
import type { RadarStatus } from './layers/radarLayer';
import type { AlertsStatus } from './layers/stormsAlertsLayer';
import type { PurpleAirStatus } from './layers/purpleAirLayer';
import type { FirmsStatus } from './layers/firmsLayer';
import type { SmokeStatus } from './layers/smokeLayer';
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

function severityWord(severity: string): string {
  return severity; // NWS's own vocabulary (Extreme/Severe/Moderate/Minor/Unknown) -- not remapped.
}

// Environmental context map (spec 7.2/7.3's "why here, why now?" panel,
// rebuilt 2026-08-17 against the Mapbox implementation brief, extended
// 2026-08-17 with native Storms (NWS alerts + animated radar) and Air &
// fire (PurpleAir + FIRMS + HMS smoke) content). Purely environmental --
// no per-tree insight/driver claims -- so it never presents a demo tree
// signal as though it were measured environmental correlation. Tree-
// specific priority framing stays in PriorityIntelligencePanel, a separate
// component scoped to that claim.
export function EnvironmentalContextPanel({ latest, regionalAqi, forecast, freshnessLabel, compact }: EnvironmentalContextPanelProps) {
  const { system } = useUnits();
  const [layer, setLayer] = useState<MapLayerId>('impact');
  const [radarStatus, setRadarStatus] = useState<RadarStatus>({ state: 'loading' });
  const [alertsStatus, setAlertsStatus] = useState<AlertsStatus>({ state: 'loading' });
  const [purpleAirStatus, setPurpleAirStatus] = useState<PurpleAirStatus>({ state: 'loading' });
  const [firmsStatus, setFirmsStatus] = useState<FirmsStatus>({ state: 'loading' });
  const [smokeStatus, setSmokeStatus] = useState<SmokeStatus>({ state: 'loading' });
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
        onAlertsStatus={setAlertsStatus}
        onPurpleAirStatus={setPurpleAirStatus}
        onFirmsStatus={setFirmsStatus}
        onSmokeStatus={setSmokeStatus}
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

        {layer === 'airFire' && (
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
                current each value actually is. forecastDate (which day
                the AQI number is valid for) is shown separately from ts
                (when we fetched it) -- see airnow.ts's timestamp-gap fix. */}
            {regionalAqi?.ts && <Row label="Regional fetched" value={new Date(regionalAqi.ts).toLocaleString()} />}
            {regionalAqi?.forecast_date && <Row label="Regional forecast for" value={regionalAqi.forecast_date} />}

            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

            <Row
              label="PurpleAir sensors"
              value={
                purpleAirStatus.state === 'loading'
                  ? 'Loading…'
                  : purpleAirStatus.state === 'unavailable'
                    ? 'Not configured'
                    : purpleAirStatus.state === 'error'
                      ? `Unavailable — ${purpleAirStatus.message}`
                      : `${purpleAirStatus.count} nearby (tap markers for readings)`
              }
            />
            <Row
              label="Fire detections (24h)"
              value={
                firmsStatus.state === 'loading'
                  ? 'Loading…'
                  : firmsStatus.state === 'unavailable'
                    ? 'Not configured'
                    : firmsStatus.state === 'error'
                      ? `Unavailable — ${firmsStatus.message}`
                      : firmsStatus.count === 0
                        ? 'None detected in the region'
                        : `${firmsStatus.count} detected hotspot${firmsStatus.count === 1 ? '' : 's'} (PNW region)`
              }
            />
            <Row
              label="Smoke plumes"
              value={
                smokeStatus.state === 'loading'
                  ? 'Loading…'
                  : smokeStatus.state === 'error'
                    ? `Unavailable — ${smokeStatus.message}`
                    : smokeStatus.count === 0
                      ? 'None observed in the region'
                      : `${smokeStatus.count} observed plume${smokeStatus.count === 1 ? '' : 's'} (PNW region)`
              }
            />
            <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
              PurpleAir markers are raw community readings, not corrected to a reference monitor. FIRMS points are satellite-detected
              hotspots, not a fire perimeter. HMS polygons are NOAA's observed smoke plume estimate from satellite imagery, not a
              ground-level concentration forecast.
            </p>
          </>
        )}

        {layer === 'storms' && (
          <>
            {radarStatus.state === 'loading' && <Row label="Radar" value="Loading…" />}
            {radarStatus.state === 'error' && <Row label="Radar" value={`Unavailable — ${radarStatus.message}`} />}
            {radarStatus.state === 'empty' && <Row label="Radar" value="No radar frame available right now" />}
            {radarStatus.state === 'ready' && (
              <>
                <Row label="Radar source" value={radarStatus.label} />
                <Row label="Frame time" value={radarStatus.frameTime.toLocaleTimeString()} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={radarStatus.onPlayPause}
                    disabled={!radarStatus.canAutoplay}
                    aria-label={radarStatus.playing ? 'Pause radar animation' : 'Play radar animation'}
                    title={radarStatus.canAutoplay ? undefined : 'Animation disabled (reduced motion preference)'}
                    style={{
                      minHeight: 36,
                      minWidth: 36,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: radarStatus.canAutoplay ? 'var(--ink)' : 'var(--ink-faint)',
                      cursor: radarStatus.canAutoplay ? 'pointer' : 'not-allowed',
                      fontSize: 14,
                    }}
                  >
                    {radarStatus.playing ? '⏸' : '▶'}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, radarStatus.frameCount - 1)}
                    value={radarStatus.frameIndex}
                    onChange={(e) => radarStatus.onScrub(Number(e.target.value))}
                    aria-label="Radar frame"
                    style={{ flex: 1, minWidth: 60 }}
                  />
                  <button
                    type="button"
                    onClick={radarStatus.onJumpToLatest}
                    disabled={radarStatus.frameIndex === radarStatus.frameCount - 1}
                    style={{
                      minHeight: 36,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      cursor: 'pointer',
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Latest
                  </button>
                </div>
              </>
            )}

            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

            {alertsStatus.state === 'loading' && <Row label="NWS alerts" value="Loading…" />}
            {alertsStatus.state === 'error' && <Row label="NWS alerts" value={`Unavailable — ${alertsStatus.message}`} />}
            {alertsStatus.state === 'ready' && alertsStatus.alerts.length === 0 && <Row label="NWS alerts" value="None active for this location" />}
            {alertsStatus.state === 'ready' && alertsStatus.alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {alertsStatus.alerts.map((alert) => (
                  <div key={alert.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontWeight: 600 }}>
                      <span>{alert.event}</span>
                      <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>{severityWord(alert.severity)}</span>
                    </div>
                    {!alert.geometry && <p style={{ color: 'var(--ink-soft)', margin: '4px 0' }}>Applies to: {alert.areaDesc} (no polygon geometry provided by NWS for this alert)</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                      {alert.effective && <Row label="Effective" value={new Date(alert.effective).toLocaleString()} />}
                      {alert.expires && <Row label="Expires" value={new Date(alert.expires).toLocaleString()} />}
                    </div>
                    <a href={alert.webUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--insight)' }}>
                      View on weather.gov →
                    </a>
                  </div>
                ))}
              </div>
            )}

            <Row label="Frost risk" value={frostDay ? `${frostDay.date} (7-day forecast)` : 'None in the 7-day forecast'} />
            <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
              Public regional radar (RainViewer, observed frames only) and active NWS alerts for this location — attribution shown on the
              map. Local rain-gauge reading is on the Environment page.
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
