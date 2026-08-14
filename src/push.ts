// Web Push delivery via webpush-webcrypto (pure Web Crypto API -- unlike
// the Node-only `web-push` package, this runs in Workers). No compliance
// regime like sms/consent.ts: granting the browser permission prompt IS
// the consent mechanism, there's no equivalent opt-out/category system to
// enforce here.

import { ApplicationServerKeys, generatePushHTTPRequest } from 'webpush-webcrypto';
import type { Env } from './env';

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

async function getApplicationServerKeys(env: Env): Promise<ApplicationServerKeys | null> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return ApplicationServerKeys.fromJSON({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });
}

async function sendToSubscription(env: Env, keys: ApplicationServerKeys, sub: PushSubscriptionRow, payload: string): Promise<{ ok: boolean; expired: boolean }> {
  const { headers, body, endpoint } = await generatePushHTTPRequest({
    applicationServerKeys: keys,
    payload,
    target: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    adminContact: env.ALERT_EMAIL_TO ? `mailto:${env.ALERT_EMAIL_TO}` : 'mailto:admin@grove-iq.com',
    ttl: 60 * 60,
    urgency: 'normal',
  });

  const res = await fetch(endpoint, { method: 'POST', headers, body });

  if (res.status === 404 || res.status === 410) {
    // Push service says this subscription is gone (browser uninstalled,
    // user cleared permissions, etc.) -- stop trying it.
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
    return { ok: false, expired: true };
  }

  return { ok: res.ok, expired: false };
}

// Fans out to every subscribed browser/device -- single-user app, no
// per-recipient targeting needed. Failures for one subscription don't
// block delivery to the others.
export async function sendPushToAll(env: Env, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const keys = await getApplicationServerKeys(env);
  if (!keys) return { sent: 0, failed: 0 };

  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions').all<PushSubscriptionRow>();
  const json = JSON.stringify(payload);

  let sent = 0;
  let failed = 0;
  for (const sub of results) {
    try {
      const result = await sendToSubscription(env, keys, sub, json);
      if (result.ok) sent++;
      else if (!result.expired) failed++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
