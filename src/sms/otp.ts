// Phone verification via OTP (section 7). Sent through sendSms() directly,
// NOT through sendOperationalSms()'s consent gate -- verification is a
// one-time transactional message the user just explicitly requested by
// clicking "verify," not a recurring alert, and per section 6.1 step 6
// must not itself enroll the user in anything.

import type { Env } from '../env';
import { hashOtpCode, hashPhone, redactPhone } from './crypto';
import { sendSms } from './twilio';

const OTP_EXPIRY_MINUTES = 10;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS_PER_CHALLENGE = 5;
const RESEND_COOLDOWN_SECONDS = 30;

export type RequestOtpResult = { ok: true } | { ok: false; reason: string };

export async function requestOtp(env: Env, phoneE164: string): Promise<RequestOtpResult> {
  const phoneHash = await hashPhone(env, phoneE164);

  const recentCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM otp_challenges WHERE phone_hash = ? AND created_at >= datetime('now', '-1 hour')`
  )
    .bind(phoneHash)
    .first<{ count: number }>();
  if ((recentCount?.count ?? 0) >= MAX_SENDS_PER_HOUR) {
    return { ok: false, reason: 'rate_limited' };
  }

  const lastChallenge = await env.DB.prepare(
    `SELECT created_at FROM otp_challenges WHERE phone_hash = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(phoneHash)
    .first<{ created_at: string }>();
  if (lastChallenge) {
    const ageSeconds = (Date.now() - new Date(lastChallenge.created_at + 'Z').getTime()) / 1000;
    if (ageSeconds < RESEND_COOLDOWN_SECONDS) {
      return { ok: false, reason: 'cooldown' };
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000).toISOString();

  await env.DB.prepare(
    `INSERT INTO otp_challenges (id, phone_hash, code_hash, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), phoneHash, codeHash, expiresAt)
    .run();

  const body = `GroveIQ verification code: ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code. This one-time message does not enroll you in recurring texts.`;
  const result = await sendSms(env, phoneE164, body);
  if ('error' in result) {
    console.error(`OTP send failed for ${redactPhone(phoneE164)}: ${result.error}`);
    return { ok: false, reason: 'send_failed' };
  }

  return { ok: true };
}

export type ConfirmOtpResult = { ok: true } | { ok: false; reason: string };

export async function confirmOtp(env: Env, phoneE164: string, code: string): Promise<ConfirmOtpResult> {
  const phoneHash = await hashPhone(env, phoneE164);

  const challenge = await env.DB.prepare(
    `SELECT id, code_hash, attempts, expires_at FROM otp_challenges
     WHERE phone_hash = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(phoneHash)
    .first<{ id: string; code_hash: string; attempts: number; expires_at: string }>();

  if (!challenge) return { ok: false, reason: 'no_pending_challenge' };
  if (new Date(challenge.expires_at + 'Z').getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (challenge.attempts >= MAX_ATTEMPTS_PER_CHALLENGE) return { ok: false, reason: 'too_many_attempts' };

  const submittedHash = await hashOtpCode(code);
  if (submittedHash !== challenge.code_hash) {
    await env.DB.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').bind(challenge.id).run();
    return { ok: false, reason: 'incorrect_code' };
  }

  await env.DB.prepare(`UPDATE otp_challenges SET consumed_at = datetime('now') WHERE id = ?`).bind(challenge.id).run();
  return { ok: true };
}
