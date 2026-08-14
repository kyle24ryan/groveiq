import { Link } from 'react-router-dom';
import { Card } from '../Card';
import { useUnits } from '../../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../../lib/units';
import type { ConditionsReading, RegionalAqi } from '../../lib/api';

type GroveConditionStripProps = {
  latest: ConditionsReading | null;
  regionalAqi: RegionalAqi | null;
  demand: { label: string; tone: 'ok' | 'watch' | 'urgent' };
  vpd: number | null;
  freshnessLabel: string;
  freshnessStale: boolean;
};

// Four grouped operational summaries, not an arbitrary weather-metric grid
// (spec 6.4) — each tile answers one operational question rather than
// reporting one more raw reading. Full detail lives on Environment/Spatial;
// this is the summary layer.
export function GroveConditionStrip({ latest, regionalAqi, demand, vpd, freshnessLabel, freshnessStale }: GroveConditionStripProps) {
  const { system } = useUnits();

  const batteryOk = latest?.battery_sensor_array_code === 0;
  const batteryKnown = latest?.battery_sensor_array_code != null;

  return (
    <div className="rgrid-4" style={{ gap: 14 }}>
      <ConditionTile
        label="Outdoor"
        value={latest?.outdoor_temp_c != null ? `${formatTemp(latest.outdoor_temp_c, system)}${tempUnit(system)}` : '—'}
        detail={latest?.humidity_pct != null ? `${latest.humidity_pct}% humidity` : 'Humidity unavailable'}
        href="/environment"
      />
      <ConditionTile
        label="Water demand"
        value={demand.label}
        valueTone={demand.tone}
        detail={vpd != null ? `VPD ${vpd.toFixed(2)} kPa · peak 1-5pm` : 'Waiting on live VPD'}
        href="/environment"
      />
      <ConditionTile
        label="Air quality"
        value={latest?.pm25_aqi != null ? String(Math.round(latest.pm25_aqi)) : '—'}
        detail={
          regionalAqi?.airnow_aqi != null
            ? `Local · Regional AQI ${regionalAqi.airnow_aqi.toFixed(0)} ${regionalAqi.airnow_category ?? ''}`
            : 'Regional comparison unavailable'
        }
        href="/environment"
      />
      <ConditionTile
        label="Sensors"
        value={freshnessLabel}
        valueTone={freshnessStale ? 'watch' : 'ok'}
        detail={batteryKnown ? (batteryOk ? 'Sensor array battery normal' : 'Sensor array battery low') : 'Weather gateway'}
        href="/settings"
      />
    </div>
  );
}

function ConditionTile({
  label,
  value,
  detail,
  valueTone,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  valueTone?: 'ok' | 'watch' | 'urgent';
  href: string;
}) {
  return (
    <Link to={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card style={{ height: '100%' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {label}
        </div>
        <div className={`mono ${valueTone ? `status-${valueTone}` : ''}`} style={{ fontSize: 20, fontWeight: 600 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{detail}</div>
      </Card>
    </Link>
  );
}
