import { useEffect, useState } from 'react';
import { fetchActiveAlerts, type ActiveAlert } from '../lib/api';
import { useUnits, type UnitSystem } from '../contexts/UnitsContext';
import { formatTemp, tempUnit, formatWindSpeed, windSpeedUnit } from '../lib/units';

// Alert messages are built here, not trusted from the backend's stored
// `message` string — that string is generated once at write time in fixed
// units (°C/mph) and can't react to the user's unit-system choice. All
// reading_value fields are stored in canonical units (°C for temp, mph for
// wind) regardless of alert_type, matching conditions_readings' convention.
function formatAlertMessage(a: ActiveAlert, system: UnitSystem): string {
  const urgent = a.tier === 'urgent';
  switch (a.alert_type) {
    case 'wind':
      return `Wind speed at ${formatWindSpeed(a.reading_value, system)} ${windSpeedUnit(system)} — ${urgent ? 'high wind' : 'elevated wind'}.`;
    case 'heat':
      return `WBGT heat index at ${formatTemp(a.reading_value, system)}${tempUnit(system)} — ${urgent ? 'significant heat stress risk' : 'elevated heat stress'}.`;
    case 'aqi':
      return `Air Quality Index at ${a.reading_value?.toFixed(0) ?? '—'} — ${urgent ? 'unhealthy air' : 'moderate/unhealthy for sensitive groups'}.`;
    case 'frost':
      return `Frost risk — forecast low of ${formatTemp(a.reading_value, system)}${tempUnit(system)} in the next 48 hours.`;
    case 'wind_gust_forecast':
      return `Forecast wind gusts up to ${formatWindSpeed(a.reading_value, system)} ${windSpeedUnit(system)} in the next 48 hours.`;
    default:
      return a.message; // fallback for any alert_type this component doesn't know about yet
  }
}

export function AlertBanner() {
  const { system } = useUnits();
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchActiveAlerts()
      .then((a) => {
        if (!cancelled) setAlerts(a);
      })
      .catch(() => {
        // Silent — a banner that fails to load shouldn't block the rest of the page.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alerts.map((a) => (
        <div
          key={a.id}
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius)',
            border: `1px solid var(--${a.tier})`,
            background: `var(--${a.tier}-bg)`,
            fontSize: 13.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`status-dot status-${a.tier}`} aria-hidden="true" />
            <span className={`status-${a.tier}`} style={{ fontWeight: 600, textTransform: 'capitalize' }}>
              {a.tier}
            </span>
            <span>{formatAlertMessage(a, system)}</span>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>
            {a.alert_type === 'frost' || a.alert_type === 'wind_gust_forecast' ? 'Forecast · ' : 'Current condition · '}
            in-app only — email/SMS not wired up yet
          </div>
        </div>
      ))}
    </div>
  );
}
