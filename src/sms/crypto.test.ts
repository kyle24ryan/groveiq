import { describe, it, expect } from 'vitest';
import { encryptPhone, decryptPhone, hashPhone, hashOtpCode, normalizeE164, redactPhone } from './crypto';
import type { Env } from '../env';

function randomBase64Key(bytes: number): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = '';
  for (const b of raw) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Self-generated test-only key material -- never real secrets.
const testEnv = {
  PHONE_ENCRYPTION_KEY: randomBase64Key(32),
  PHONE_HASH_KEY: randomBase64Key(32),
} as Env;

describe('encryptPhone/decryptPhone', () => {
  it('round-trips a phone number', async () => {
    const encrypted = await encryptPhone(testEnv, '+14255551234');
    expect(encrypted).not.toContain('+14255551234');
    expect(await decryptPhone(testEnv, encrypted)).toBe('+14255551234');
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const a = await encryptPhone(testEnv, '+14255551234');
    const b = await encryptPhone(testEnv, '+14255551234');
    expect(a).not.toBe(b);
  });

  it('throws when the encryption key is not configured', async () => {
    await expect(encryptPhone({} as Env, '+14255551234')).rejects.toThrow();
  });
});

describe('hashPhone', () => {
  it('is deterministic for the same number', async () => {
    const a = await hashPhone(testEnv, '+14255551234');
    const b = await hashPhone(testEnv, '+14255551234');
    expect(a).toBe(b);
  });

  it('differs for different numbers', async () => {
    const a = await hashPhone(testEnv, '+14255551234');
    const b = await hashPhone(testEnv, '+14255559999');
    expect(a).not.toBe(b);
  });
});

describe('hashOtpCode', () => {
  it('is deterministic and never returns the raw code', async () => {
    const hash = await hashOtpCode('123456');
    expect(hash).not.toContain('123456');
    expect(await hashOtpCode('123456')).toBe(hash);
  });
});

describe('normalizeE164', () => {
  it('accepts an already-E.164 number as-is', () => {
    expect(normalizeE164('+14255551234')).toBe('+14255551234');
  });

  it('adds +1 to a bare 10-digit US number', () => {
    expect(normalizeE164('4255551234')).toBe('+14255551234');
  });

  it('normalizes formatted US numbers', () => {
    expect(normalizeE164('(425) 555-1234')).toBe('+14255551234');
  });

  it('accepts an 11-digit number already starting with 1', () => {
    expect(normalizeE164('14255551234')).toBe('+14255551234');
  });

  it('rejects numbers it cannot confidently normalize', () => {
    expect(normalizeE164('123')).toBeNull();
    expect(normalizeE164('not a phone number')).toBeNull();
  });
});

describe('redactPhone', () => {
  it('keeps only the last 4 digits visible', () => {
    expect(redactPhone('+14255551234')).toBe('***1234');
  });

  it('fully redacts very short input', () => {
    expect(redactPhone('123')).toBe('***');
  });
});
