// Phone number encryption/hashing (SPEC section 10.4: "Encrypt phone
// numbers at rest and in transit; redact them from application logs").
//
// Two keys, two purposes:
// - PHONE_ENCRYPTION_KEY (AES-GCM): stores the actual number, decryptable,
//   used only when the real number is needed (e.g. sending an SMS).
// - PHONE_HASH_KEY (HMAC-SHA256): deterministic keyed hash for lookup/dedup
//   without ever storing or querying the plaintext number. AES-GCM is
//   intentionally non-deterministic (random IV per encryption), so it
//   can't be used for equality lookups -- that's what phone_hash is for.

import type { Env } from '../env';

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function importHmacKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encryptPhone(env: Env, phoneE164: string): Promise<string> {
  if (!env.PHONE_ENCRYPTION_KEY) throw new Error('PHONE_ENCRYPTION_KEY not configured');
  const key = await importAesKey(env.PHONE_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(phoneE164));
  // iv (12 bytes) + ciphertext, base64-encoded together.
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

export async function decryptPhone(env: Env, encrypted: string): Promise<string> {
  if (!env.PHONE_ENCRYPTION_KEY) throw new Error('PHONE_ENCRYPTION_KEY not configured');
  const key = await importAesKey(env.PHONE_ENCRYPTION_KEY);
  const combined = base64ToBytes(encrypted);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export async function hashPhone(env: Env, phoneE164: string): Promise<string> {
  if (!env.PHONE_HASH_KEY) throw new Error('PHONE_HASH_KEY not configured');
  const key = await importHmacKey(env.PHONE_HASH_KEY);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(phoneE164));
  return bytesToHex(sig);
}

export async function hashOtpCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return bytesToHex(digest);
}

// US-centric E.164 normalization -- reasonable given this app's whole
// context (North Bend WA, NWS is US-only, Twilio number is a US long
// code). Rejects anything it can't confidently normalize rather than
// guessing at other countries' numbering plans.
export function normalizeE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed; // already E.164-shaped, trust it
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Never log a raw phone number. Use this for any log/error message that
// might include one.
export function redactPhone(phoneE164: string): string {
  return phoneE164.length > 4 ? `***${phoneE164.slice(-4)}` : '***';
}
