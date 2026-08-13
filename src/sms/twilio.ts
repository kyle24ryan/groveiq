import type { Env } from '../env';

export type TwilioSendResult = { sid: string } | { error: string };

export async function sendSms(env: Env, to: string, body: string): Promise<TwilioSendResult> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_API_KEY_SID || !env.TWILIO_API_KEY_SECRET || !env.TWILIO_FROM_NUMBER) {
    return { error: 'Twilio not configured' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`);
  const form = new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER, Body: body });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const json = (await res.json()) as { sid?: string; message?: string; code?: number };
  if (!res.ok) {
    return { error: json.message ?? `Twilio returned ${res.status}` };
  }
  return { sid: json.sid! };
}

// Twilio request signature validation (section 11.2.1). Uses the Auth
// Token (not the API Key) -- Twilio signs webhook requests with the Auth
// Token specifically, this is unrelated to the API Key used for sending.
//
// Algorithm per Twilio docs: HMAC-SHA1 of (full request URL + sorted POST
// param key+value pairs concatenated), base64-encoded, compared to the
// X-Twilio-Signature header.
export async function validateTwilioSignature(
  authToken: string,
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Constant-time-ish comparison (base64 strings are fixed-length for a
  // given hash size, so this doesn't leak much via early-exit timing).
  if (computed.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}
