import { useEffect, useState } from 'react';
import { fetchActiveAlerts, type ActiveAlert } from '../lib/api';

export function AlertBanner() {
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
            <span>{a.message}</span>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>
            In-app only — email/SMS not wired up yet
          </div>
        </div>
      ))}
    </div>
  );
}
