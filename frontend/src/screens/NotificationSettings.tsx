import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { PushNotificationsCard } from '../components/PushNotificationsCard';
import {
  fetchConsentText,
  fetchNotificationPreferences,
  startPhoneVerification,
  confirmPhoneVerification,
  setNotificationCategories,
  withdrawSmsConsent,
  type ConsentTextResponse,
  type NotificationPreferences,
} from '../lib/api';

type Step = 'loading' | 'enter_phone' | 'enter_code' | 'manage';

export function NotificationSettings() {
  const [step, setStep] = useState<Step>('loading');
  const [consentText, setConsentText] = useState<ConsentTextResponse | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  const [phone, setPhone] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [code, setCode] = useState('');
  const [categories, setCategoriesState] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPreferences() {
    const p = await fetchNotificationPreferences();
    setPrefs(p);
    setCategoriesState(p.categories);
    if (p.phoneVerified && p.operationalConsent === 'active') {
      setStep('manage');
    } else {
      setStep('enter_phone');
    }
  }

  useEffect(() => {
    Promise.all([fetchConsentText(), fetchNotificationPreferences()])
      .then(([text, p]) => {
        setConsentText(text);
        setPrefs(p);
        setCategoriesState(p.categories);
        if (p.phoneVerified && p.operationalConsent === 'active') {
          setStep('manage');
        } else {
          setStep('enter_phone');
        }
      })
      .catch(() => setError("Couldn't load your notification settings right now — try refreshing the page."));
  }, []);

  async function handleSendCode() {
    setError(null);
    setBusy(true);
    const result = await startPhoneVerification(phone, consentChecked);
    setBusy(false);
    if (!result.ok) {
      setError(result.error === 'rate_limited' ? 'Too many attempts — try again in an hour.' : result.error === 'cooldown' ? 'Wait a bit before requesting another code.' : (result.error ?? 'Something went wrong.'));
      return;
    }
    setStep('enter_code');
  }

  async function handleVerifyCode() {
    setError(null);
    setBusy(true);
    const result = await confirmPhoneVerification(phone, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error === 'incorrect_code' ? 'That code is incorrect.' : result.error === 'expired' ? 'That code expired — request a new one.' : (result.error ?? 'Something went wrong.'));
      return;
    }
    setNotice('Phone verified.');
    await loadPreferences();
  }

  async function handleSaveCategories() {
    setError(null);
    setBusy(true);
    const result = await setNotificationCategories(categories);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save preferences.');
      return;
    }
    setNotice('Saved.');
  }

  async function handleWithdraw() {
    setError(null);
    setBusy(true);
    const result = await withdrawSmsConsent();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not turn off SMS.');
      return;
    }
    setNotice('SMS notifications turned off.');
    await loadPreferences();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
      <div>
        <Link to="/settings" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          ← Settings
        </Link>
        <h1 style={{ fontSize: 24, marginTop: 8 }}>Notification Settings</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>Manage push and text message alerts from GroveIQ.</p>
      </div>

      <PushNotificationsCard />

      {error && (
        <Card style={{ borderColor: 'var(--urgent)' }}>
          <p style={{ fontSize: 13.5, color: 'var(--urgent)' }}>{error}</p>
        </Card>
      )}
      {notice && !error && (
        <Card style={{ borderColor: 'var(--ok)' }}>
          <p style={{ fontSize: 13.5, color: 'var(--ok)' }}>{notice}</p>
        </Card>
      )}

      {step === 'loading' && <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>Loading…</p>}

      {step === 'enter_phone' && consentText && (
        <Card>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Mobile number
          </div>
          <input
            type="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--canvas)',
              color: 'var(--ink)',
              fontSize: 14,
              marginBottom: 16,
            }}
          />

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16 }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              {consentText.text}{' '}
              <a href="/terms" target="_blank" rel="noreferrer" style={{ color: 'var(--insight)' }}>
                Terms
              </a>{' '}
              &amp;{' '}
              <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--insight)' }}>
                Privacy Policy
              </a>
              .
            </span>
          </label>

          <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 12 }}>
            You can verify your number and use GroveIQ without checking this box — text alerts are entirely optional.
          </p>

          <button
            onClick={handleSendCode}
            disabled={busy || !phone}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--ink)',
              color: 'var(--canvas)',
              fontSize: 14,
              fontWeight: 500,
              cursor: busy || !phone ? 'default' : 'pointer',
              opacity: busy || !phone ? 0.5 : 1,
            }}
          >
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
        </Card>
      )}

      {step === 'enter_code' && (
        <Card>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Enter verification code
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>We texted a 6-digit code to {phone}.</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mono"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--canvas)',
              color: 'var(--ink)',
              fontSize: 18,
              letterSpacing: 4,
              marginBottom: 16,
            }}
          />
          <button
            onClick={handleVerifyCode}
            disabled={busy || code.length < 6}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--ink)',
              color: 'var(--canvas)',
              fontSize: 14,
              fontWeight: 500,
              cursor: busy || code.length < 6 ? 'default' : 'pointer',
              opacity: busy || code.length < 6 ? 0.5 : 1,
            }}
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </Card>
      )}

      {step === 'manage' && prefs && consentText && (
        <>
          <Card>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Status
            </div>
            <p style={{ fontSize: 13.5 }}>
              {prefs.phone} · <span className="status-ok">Verified</span> · SMS alerts active
            </p>
          </Card>

          <Card>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Alert categories
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(consentText.categories).map(([key, info]) => (
                <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!categories[key]}
                    onChange={(e) => setCategoriesState((prev) => ({ ...prev, [key]: e.target.checked }))}
                    style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13.5 }}>
                    {info.label}
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)' }}>{info.example}</span>
                  </span>
                </label>
              ))}
            </div>
            <button
              onClick={handleSaveCategories}
              disabled={busy}
              style={{
                marginTop: 16,
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--ink)',
                color: 'var(--canvas)',
                fontSize: 13.5,
                fontWeight: 500,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              Save
            </button>
          </Card>

          <Card style={{ borderColor: 'var(--urgent)' }}>
            <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--urgent)' }}>
              Turn off SMS
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
              Disables every category and withdraws SMS consent entirely. You can always reply STOP to any text instead.
            </p>
            <button
              onClick={handleWithdraw}
              disabled={busy}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: '1px solid var(--urgent)',
                background: 'transparent',
                color: 'var(--urgent)',
                fontSize: 13.5,
                fontWeight: 500,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              Turn off all SMS
            </button>
          </Card>
        </>
      )}
    </div>
  );
}
