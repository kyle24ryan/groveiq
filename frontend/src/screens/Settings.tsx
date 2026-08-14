import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { trees } from '../data/mockData';
import { useUnits, type UnitSystem } from '../contexts/UnitsContext';
import { formatTemp, tempUnit } from '../lib/units';
import { fetchLatestConditions, freshnessLabel, fetchAppSettings, updateAppSettings, type ConditionsReading, type AppSettings } from '../lib/api';

type ThresholdStrategy = 'groveiq' | 'species' | 'custom';

const SETTINGS_FIELDS: { key: keyof AppSettings; label: string }[] = [
  { key: 'collection_name', label: 'Collection name' },
  { key: 'owner_name', label: 'Owner' },
  { key: 'location', label: 'Location' },
  { key: 'hardiness_zone', label: 'Hardiness zone' },
];

export function Settings() {
  const [strategy, setStrategy] = useState<ThresholdStrategy>('groveiq');
  const { system, setSystem } = useUnits();
  const [latest, setLatest] = useState<ConditionsReading | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLatestConditions()
      .then((reading) => {
        if (!cancelled) setLatest(reading);
      })
      .catch(() => {
        // Devices & sensors section falls back to "unreachable" below.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const freshness = freshnessLabel(latest?.ts ?? null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Settings</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>Grove preferences, devices, notifications, and thresholds.</p>
      </div>

      <ProfileCard />

      <Card>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Units & locale
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 8 }}>Units</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(
              [
                { key: 'us', label: 'US customary', hint: '°F · mph · in · inHg' },
                { key: 'metric', label: 'Metric', hint: '°C · km/h · mm · hPa' },
              ] as { key: UnitSystem; label: string; hint: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSystem(opt.key)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: `1px solid ${system === opt.key ? 'var(--ink)' : 'var(--border)'}`,
                  background: system === opt.key ? 'var(--ink)' : 'var(--surface)',
                  color: system === opt.key ? 'var(--canvas)' : 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{opt.label}</span>
                <span className="mono" style={{ fontSize: 11, opacity: 0.75 }}>
                  {opt.hint}
                </span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            Applies across the whole app immediately and is remembered for next time. VPD, PM2.5, and EC keep their
            standard scientific units regardless of this setting.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13.5 }}>
          <Field label="Timezone" value="America/Los_Angeles" />
        </div>
      </Card>

      <Card>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Devices & sensors
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DeviceRow name="Weather gateway" status={latest ? freshness.label : 'Unreachable'} tone={latest && !freshness.stale ? 'ok' : undefined} />
          {latest && (
            <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <DeviceSubRow
                name="Sensor array battery"
                status={latest.battery_sensor_array_code === 0 ? 'Normal' : latest.battery_sensor_array_code != null ? `Low (code ${latest.battery_sensor_array_code})` : 'Unknown'}
                tone={latest.battery_sensor_array_code === 0 ? 'ok' : latest.battery_sensor_array_code != null ? 'watch' : undefined}
              />
              <DeviceSubRow
                name="PM2.5 sensor battery"
                status={latest.battery_pm25_ch1_code != null ? `Level ${latest.battery_pm25_ch1_code} (raw code, scale unconfirmed)` : 'Unknown'}
              />
              <DeviceSubRow name="Black-globe sensor" status={latest.battery_bgt_voltage_v != null ? `${latest.battery_bgt_voltage_v}V` : 'Unknown'} />
            </div>
          )}
          <DeviceRow name="Soil moisture probes (5)" status="Ordered, not yet arrived" />
          <DeviceRow name="Camera" status="Ordered, not yet installed" />
          <DeviceRow name="Irrigation controller" status="Hardware in hand, firmware scaffolded and untested" />
        </div>
      </Card>

      <Card style={{ borderColor: 'var(--watch)' }}>
        <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--watch)' }}>
          Data mode
        </div>
        <p style={{ fontSize: 13.5 }}>
          Environment and Grove's weather strip now read the live feed from the weather gateway. Per-tree readings (soil
          moisture, EC, status) are still demo data — soil probes haven't arrived yet, so there's nothing real to show there.
        </p>
      </Card>

      <Card>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Notifications
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
          <NotificationRow tier="Watch alerts" tone="watch" channels={{ email: true, push: false, sms: false }} />
          <NotificationRow tier="Attention alerts" tone="urgent" channels={{ email: true, push: false, sms: true }} />
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
            Email is live. SMS is built and consent-gated — delivery is pending Twilio's A2P 10DLC campaign approval.
          </p>
          <Link to="/settings/notifications" style={{ fontSize: 13, color: 'var(--insight)', marginTop: 4 }}>
            Manage text message alerts →
          </Link>
        </div>
      </Card>

      <Card>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Threshold strategy
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: strategy === 'custom' ? 16 : 0 }}>
          {(
            [
              { key: 'groveiq', label: 'GroveIQ recommended' },
              { key: 'species', label: 'Species recommended' },
              { key: 'custom', label: 'Custom' },
            ] as { key: ThresholdStrategy; label: string }[]
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStrategy(opt.key)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: strategy === opt.key ? 'var(--ink)' : 'var(--surface)',
                color: strategy === opt.key ? 'var(--canvas)' : 'var(--ink)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {strategy !== 'custom' ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            {strategy === 'groveiq'
              ? 'Thresholds adapt automatically from each tree’s own sensor history once enough data exists.'
              : 'Thresholds are set from each tree’s species profile.'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-soft)' }}>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Tree</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Moisture low</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Moisture high</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>EC high (mS/cm)</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Dormancy soil temp ({tempUnit(system)})</th>
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
                    {formatTemp(tree.dormancySoilTempC, system)}°
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Data & privacy
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>Export or delete your grove's data. Not available yet in this prototype.</p>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ProfileCard() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AppSettings>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAppSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function startEdit() {
    setDraft(settings ?? {});
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateAppSettings(draft);
      setSettings(updated);
      setEditing(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="eyebrow">Profile & grove</div>
        {!editing && (
          <button
            onClick={startEdit}
            disabled={!settings}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 12,
              cursor: settings ? 'pointer' : 'default',
              opacity: settings ? 1 : 0.5,
            }}
          >
            Edit
          </button>
        )}
      </div>

      {error && <p style={{ fontSize: 12.5, color: 'var(--urgent)', marginBottom: 12 }}>{error}</p>}

      {!editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13.5 }}>
          {SETTINGS_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} value={settings?.[f.key] ?? '—'} />
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13.5 }}>
            {SETTINGS_FIELDS.map((f) => (
              <label key={f.key} style={{ display: 'block' }}>
                <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 4 }}>{f.label}</div>
                <input
                  type="text"
                  value={draft[f.key] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--canvas)',
                    color: 'var(--ink)',
                    fontSize: 13.5,
                  }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={handleSave}
              disabled={busy}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--ink)',
                color: 'var(--canvas)',
                fontSize: 13,
                fontWeight: 500,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--ink)',
                fontSize: 13,
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function DeviceRow({ name, status, tone }: { name: string; status: string; tone?: 'ok' | 'watch' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
      <span>{name}</span>
      <span className={tone ? `status-${tone}` : undefined} style={{ color: tone ? undefined : 'var(--ink-soft)' }}>
        {status}
      </span>
    </div>
  );
}

function DeviceSubRow({ name, status, tone }: { name: string; status: string; tone?: 'ok' | 'watch' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-faint)' }}>
      <span>{name}</span>
      <span className={tone ? `status-${tone}` : undefined}>{status}</span>
    </div>
  );
}

function NotificationRow({
  tier,
  tone,
  channels,
}: {
  tier: string;
  tone: 'watch' | 'urgent';
  channels: { email: boolean; push: boolean; sms: boolean };
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <span className={`status-${tone}`} style={{ width: 120, flexShrink: 0, fontWeight: 500 }}>
        {tier}
      </span>
      <span className="mono" style={{ color: channels.email ? 'var(--ink)' : 'var(--ink-faint)' }}>
        Email {channels.email ? '✓' : '—'}
      </span>
      <span className="mono" style={{ color: channels.push ? 'var(--ink)' : 'var(--ink-faint)' }}>
        Push {channels.push ? '✓' : '—'}
      </span>
      <span className="mono" style={{ color: channels.sms ? 'var(--ink)' : 'var(--ink-faint)' }}>
        SMS {channels.sms ? '✓' : '—'}
      </span>
    </div>
  );
}
