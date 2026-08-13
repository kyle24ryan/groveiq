// Consent state machine (SPEC section 10, 11.3). Current state is always
// derived by writing an append-only event to sms_consent_events, then
// updating the materialized sms_subscription_state row -- never mutate
// subscription state directly without a corresponding event.

import type { Env } from '../env';
import { encryptPhone, hashPhone } from './crypto';

export type ConsentProgram = 'operational' | 'marketing';
export type ConsentCategory = 'plant_health' | 'sensor' | 'irrigation' | 'environment_weather' | 'security' | 'account_service';
export type ConsentAction =
  | 'granted'
  | 'withdrawn'
  | 'category_enabled'
  | 'category_disabled'
  | 'phone_changed'
  | 'verification_completed'
  | 'stop_received'
  | 'start_received'
  | 'help_received'
  | 'admin_suppressed';
export type ConsentStatus = 'pending' | 'active' | 'opted_out' | 'suppressed' | 'revoked';
export type ConsentSource = 'web' | 'mobile_app' | 'sms_keyword' | 'support' | 'admin' | 'migration';

export const ALL_CATEGORIES: ConsentCategory[] = ['plant_health', 'sensor', 'irrigation', 'environment_weather', 'security', 'account_service'];

// Single-user app: there's at most one phone_contacts row in practice.
export async function getPrimaryPhoneContact(env: Env): Promise<{ id: string; verified_at: string | null } | null> {
  return env.DB.prepare('SELECT id, verified_at FROM phone_contacts ORDER BY updated_at DESC LIMIT 1').first();
}

export async function getOrCreatePhoneContact(env: Env, phoneE164: string): Promise<{ id: string; isNew: boolean }> {
  const hash = await hashPhone(env, phoneE164);
  const existing = await env.DB.prepare('SELECT id FROM phone_contacts WHERE phone_hash = ?').bind(hash).first<{ id: string }>();
  if (existing) return { id: existing.id, isNew: false };

  const id = crypto.randomUUID();
  const encrypted = await encryptPhone(env, phoneE164);
  const countryCode = phoneE164.startsWith('+1') ? 'US' : null;
  await env.DB.prepare(
    `INSERT INTO phone_contacts (id, phone_encrypted, phone_hash, country_code) VALUES (?, ?, ?, ?)`
  )
    .bind(id, encrypted, hash, countryCode)
    .run();
  return { id, isNew: true };
}

type RecordEventParams = {
  phoneContactId: string;
  program: ConsentProgram;
  category: ConsentCategory | null;
  action: ConsentAction;
  statusAfter: ConsentStatus;
  source: ConsentSource;
  consentText?: string;
  consentTextVersion?: string;
  privacyVersion?: string;
  termsVersion?: string;
  uiSurface?: string;
  ipAddress?: string;
  userAgent?: string;
  twilioMessageSid?: string;
  twilioMessagingServiceSid?: string;
  twilioOptOutType?: string;
  requestId?: string;
};

export async function recordConsentEvent(env: Env, params: RecordEventParams): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sms_consent_events (
      id, phone_contact_id, program, category, action, status_after, source,
      consent_text, consent_text_version, privacy_version, terms_version, ui_surface,
      ip_address, user_agent, twilio_message_sid, twilio_messaging_service_sid,
      twilio_opt_out_type, request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      params.phoneContactId,
      params.program,
      params.category,
      params.action,
      params.statusAfter,
      params.source,
      params.consentText ?? null,
      params.consentTextVersion ?? null,
      params.privacyVersion ?? null,
      params.termsVersion ?? null,
      params.uiSurface ?? null,
      params.ipAddress ?? null,
      params.userAgent ?? null,
      params.twilioMessageSid ?? null,
      params.twilioMessagingServiceSid ?? null,
      params.twilioOptOutType ?? null,
      params.requestId ?? null
    )
    .run();

  // Materialize current state from this event.
  const globalOptOut = params.statusAfter === 'opted_out' || params.statusAfter === 'suppressed' ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO sms_subscription_state (user_id, phone_contact_id, program, consent_status, global_opt_out, consented_at, revoked_at, last_event_id, version)
     VALUES ('kyle', ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(user_id, phone_contact_id, program) DO UPDATE SET
       consent_status = excluded.consent_status,
       global_opt_out = excluded.global_opt_out,
       consented_at = CASE WHEN excluded.consent_status = 'active' THEN excluded.consented_at ELSE sms_subscription_state.consented_at END,
       revoked_at = CASE WHEN excluded.consent_status IN ('opted_out','revoked') THEN excluded.revoked_at ELSE sms_subscription_state.revoked_at END,
       last_event_id = excluded.last_event_id,
       version = sms_subscription_state.version + 1`
  )
    .bind(
      params.phoneContactId,
      params.program,
      params.statusAfter,
      globalOptOut,
      params.statusAfter === 'active' ? new Date().toISOString() : null,
      params.statusAfter === 'opted_out' || params.statusAfter === 'revoked' ? new Date().toISOString() : null,
      id
    )
    .run();

  return id;
}

export async function setCategoryEnabled(
  env: Env,
  phoneContactId: string,
  category: ConsentCategory,
  enabled: boolean
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO sms_category_subscriptions (user_id, phone_contact_id, category, enabled, updated_at)
     VALUES ('kyle', ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, phone_contact_id, category) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
  )
    .bind(phoneContactId, category, enabled ? 1 : 0)
    .run();

  await recordConsentEvent(env, {
    phoneContactId,
    program: 'operational',
    category,
    action: enabled ? 'category_enabled' : 'category_disabled',
    statusAfter: 'active', // category toggles don't change program-level consent status
    source: 'web',
  });
}

export type SendAuthorization = { allowed: true } | { allowed: false; reason: string };

// The single gate every outbound SMS must pass through, re-checked
// immediately before Twilio submission (section 11.3) -- never trust a
// check performed when a job was queued.
export async function authorizeOperationalSend(env: Env, phoneContactId: string, category: ConsentCategory): Promise<SendAuthorization> {
  const contact = await env.DB.prepare('SELECT verified_at FROM phone_contacts WHERE id = ?').bind(phoneContactId).first<{ verified_at: string | null }>();
  if (!contact) return { allowed: false, reason: 'unknown_phone_contact' };
  if (!contact.verified_at) return { allowed: false, reason: 'phone_not_verified' };

  const state = await env.DB.prepare(
    `SELECT consent_status, global_opt_out FROM sms_subscription_state WHERE phone_contact_id = ? AND program = 'operational'`
  )
    .bind(phoneContactId)
    .first<{ consent_status: ConsentStatus; global_opt_out: number }>();
  if (!state) return { allowed: false, reason: 'no_consent_record' };
  if (state.global_opt_out) return { allowed: false, reason: 'global_opt_out' };
  if (state.consent_status !== 'active') return { allowed: false, reason: `consent_status_${state.consent_status}` };

  const categoryRow = await env.DB.prepare(
    `SELECT enabled FROM sms_category_subscriptions WHERE phone_contact_id = ? AND category = ?`
  )
    .bind(phoneContactId, category)
    .first<{ enabled: number }>();
  if (!categoryRow || !categoryRow.enabled) return { allowed: false, reason: 'category_disabled' };

  return { allowed: true };
}
