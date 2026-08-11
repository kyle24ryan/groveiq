import { Card } from '../components/Card';
import { trees } from '../data/mockData';

export function Settings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Settings</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>Thresholds, sensor mapping, alert channels.</p>
      </div>

      <Card>
        <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
          Per-tree thresholds
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>Tree</th>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>Moisture low</th>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>Moisture high</th>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>EC high</th>
              <th style={{ padding: '6px 8px', fontWeight: 500 }}>Dormancy soil temp</th>
            </tr>
          </thead>
          <tbody>
            {trees.map((tree) => (
              <tr key={tree.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px' }}>{tree.name}</td>
                <td className="mono" style={{ padding: '8px' }}>
                  {tree.soilMoistureThresholdLow}%
                </td>
                <td className="mono" style={{ padding: '8px' }}>
                  {tree.soilMoistureThresholdHigh}%
                </td>
                <td className="mono" style={{ padding: '8px' }}>
                  {tree.ecThresholdHigh}
                </td>
                <td className="mono" style={{ padding: '8px' }}>
                  {tree.dormancySoilTempC}°C
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
          Alert channels
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <div>Watch tier → Email (Resend)</div>
          <div>Urgent tier → Email + SMS (Twilio)</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Not wired up yet — Phase 2.</div>
        </div>
      </Card>
    </div>
  );
}
