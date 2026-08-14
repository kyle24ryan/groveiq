import { useEffect, useState, type CSSProperties } from 'react';
import { Card } from './Card';
import { fetchVapidPublicKey, subscribePush, unsubscribePush, sendTestPush } from '../lib/api';

type Status = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on';

// Base64url -> Uint8Array, needed because PushManager.subscribe wants the
// VAPID public key as raw bytes but our backend serves it as the base64url
// string webpush-webcrypto produces.
function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// Standalone from the SMS consent flow -- push has no phone number, no
// OTP, no compliance regime to walk through. The browser's own permission
// prompt is the entire consent mechanism.
export function PushNotificationsCard() {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('blocked');
      return;
    }
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? 'on' : 'off'))
      .catch(() => setStatus('off'));
  }, []);

  async function handleEnable() {
    setError(null);
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const publicKey = await fetchVapidPublicKey();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const result = await subscribePush(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (!result.ok) throw new Error(result.error ?? 'subscribe failed');
      setStatus('on');
    } catch {
      setError("Couldn't turn on push notifications — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setError(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus('off');
    } catch {
      setError("Couldn't turn off push notifications — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setError(null);
    setTestResult(null);
    setBusy(true);
    try {
      const result = await sendTestPush();
      setTestResult(result.sent > 0 ? 'Test notification sent — check for it.' : 'No active subscriptions to send to.');
    } catch {
      setError("Couldn't send a test notification right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Push notifications
      </div>

      {status === 'checking' && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Checking browser support…</p>}

      {status === 'unsupported' && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>This browser doesn't support push notifications.</p>}

      {status === 'blocked' && (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          Notifications are blocked for this site in your browser settings. Re-enable them there to turn this on.
        </p>
      )}

      {(status === 'off' || status === 'on') && (
        <>
          <p style={{ fontSize: 13.5, marginBottom: 12 }}>
            {status === 'on'
              ? 'Watch and attention alerts will show as browser notifications on this device.'
              : 'Get watch and attention alerts as browser notifications on this device, in addition to email.'}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {status === 'off' ? (
              <button onClick={handleEnable} disabled={busy} style={buttonStyle(busy, 'primary')}>
                {busy ? 'Enabling…' : 'Enable push notifications'}
              </button>
            ) : (
              <>
                <button onClick={handleTest} disabled={busy} style={buttonStyle(busy, 'secondary')}>
                  Send test notification
                </button>
                <button onClick={handleDisable} disabled={busy} style={buttonStyle(busy, 'secondary')}>
                  Turn off
                </button>
              </>
            )}
          </div>
          {testResult && <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 10 }}>{testResult}</p>}
        </>
      )}

      {error && <p style={{ fontSize: 12, color: 'var(--urgent)', marginTop: 10 }}>{error}</p>}
    </Card>
  );
}

function buttonStyle(busy: boolean, variant: 'primary' | 'secondary'): CSSProperties {
  return {
    padding: '9px 16px',
    borderRadius: 8,
    border: variant === 'primary' ? 'none' : '1px solid var(--border)',
    background: variant === 'primary' ? 'var(--ink)' : 'transparent',
    color: variant === 'primary' ? 'var(--canvas)' : 'var(--ink)',
    fontSize: 13.5,
    fontWeight: 500,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.5 : 1,
  };
}
