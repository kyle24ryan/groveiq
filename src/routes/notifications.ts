import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { normalizeE164, hashPhone, redactPhone, decryptPhone } from '../sms/crypto';
import { getOrCreatePhoneContact, recordConsentEvent, setCategoryEnabled, ALL_CATEGORIES, type ConsentCategory } from '../sms/consent';
import { requestOtp, confirmOtp } from '../sms/otp';
import { sendSms } from '../sms/twilio';
import {
  OPERATIONAL_CONSENT_TEXT,
  OPERATIONAL_CONSENT_TEXT_VERSION,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  CATEGORY_LABELS,
  OPT_IN_CONFIRMATION_TEXT,
} from '../sms/policyVersions';

function json(body: unknown, headers: HeadersInit, status = 200): Response {
  return Response.json(body, { status, headers });
}

async function findVerifiedPhoneContact(env: Env): Promise<{ id: string; phone_encrypted: string; verified_at: string | null } | null> {
  // Single-user app: there's at most one phone_contacts row in practice.
  // Most recently updated wins if somehow more than one exists (e.g. a
  // phone-number change created a new contact row).
  return env.DB.prepare('SELECT id, phone_encrypted, verified_at FROM phone_contacts ORDER BY updated_at DESC LIMIT 1').first();
}

export async function handleGetPreferences(env: Env, headers: HeadersInit): Promise<Response> {
  const contact = await findVerifiedPhoneContact(env);
  if (!contact) {
    return json(
      {
        phone: null,
        phoneVerified: false,
        operationalConsent: 'pending',
        categories: Object.fromEntries(ALL_CATEGORIES.map((c) => [c, false])),
        consentTextVersion: OPERATIONAL_CONSENT_TEXT_VERSION,
        privacyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: TERMS_VERSION,
      },
      headers
    );
  }

  const state = await env.DB.prepare(
    `SELECT consent_status FROM sms_subscription_state WHERE phone_contact_id = ? AND program = 'operational'`
  )
    .bind(contact.id)
    .first<{ consent_status: string }>();

  const categoryRows = await env.DB.prepare('SELECT category, enabled FROM sms_category_subscriptions WHERE phone_contact_id = ?')
    .bind(contact.id)
    .all<{ category: string; enabled: number }>();
  const categories = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, false]));
  for (const row of categoryRows.results) categories[row.category] = !!row.enabled;

  const phone = await decryptPhone(env, contact.phone_encrypted);

  return json(
    {
      phone: redactPhone(phone),
      phoneVerified: !!contact.verified_at,
      operationalConsent: state?.consent_status ?? 'pending',
      categories,
      consentTextVersion: OPERATIONAL_CONSENT_TEXT_VERSION,
      privacyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: TERMS_VERSION,
    },
    headers
  );
}

export function handleGetConsentText(headers: HeadersInit): Response {
  return json(
    {
      text: OPERATIONAL_CONSENT_TEXT,
      version: OPERATIONAL_CONSENT_TEXT_VERSION,
      categories: CATEGORY_LABELS,
    },
    headers
  );
}

export async function handleVerificationStart(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body = (await request.json()) as { phone?: string; operationalConsent?: boolean };
  if (!body.phone) return json({ error: 'phone required' }, headers, 400);

  const normalized = normalizeE164(body.phone);
  if (!normalized) return json({ error: 'invalid_phone' }, headers, 400);

  const { id: phoneContactId } = await getOrCreatePhoneContact(env, normalized);

  // Entering a number and requesting verification does NOT by itself
  // grant consent (section 6.3) -- only record a 'granted' event if the
  // checkbox was actually checked.
  if (body.operationalConsent) {
    await recordConsentEvent(env, {
      phoneContactId,
      program: 'operational',
      category: null,
      action: 'granted',
      statusAfter: 'pending', // promoted to 'active' only after verification completes
      source: 'web',
      consentText: OPERATIONAL_CONSENT_TEXT,
      consentTextVersion: OPERATIONAL_CONSENT_TEXT_VERSION,
      privacyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: TERMS_VERSION,
      uiSurface: '/settings/notifications',
    });
  }

  const result = await requestOtp(env, normalized);
  if (!result.ok) return json({ error: result.reason }, headers, 429);

  return json({ ok: true }, headers);
}

export async function handleVerificationConfirm(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body = (await request.json()) as { phone?: string; code?: string };
  if (!body.phone || !body.code) return json({ error: 'phone and code required' }, headers, 400);

  const normalized = normalizeE164(body.phone);
  if (!normalized) return json({ error: 'invalid_phone' }, headers, 400);

  const result = await confirmOtp(env, normalized, body.code);
  if (!result.ok) return json({ error: result.reason }, headers, 400);

  const hash = await hashPhone(env, normalized);
  const contact = await env.DB.prepare('SELECT id FROM phone_contacts WHERE phone_hash = ?').bind(hash).first<{ id: string }>();
  if (!contact) return json({ error: 'contact_not_found' }, headers, 404);

  await env.DB.prepare(
    `UPDATE phone_contacts SET verified_at = datetime('now'), verification_provider = 'groveiq_otp', updated_at = datetime('now') WHERE id = ?`
  )
    .bind(contact.id)
    .run();

  // Verification completion is what activates program-level operational
  // consent (section 6.1 step 8-9) -- only if a 'granted' event already
  // exists as pending; if the user never checked the consent box, this
  // just verifies the number without activating anything.
  const pending = await env.DB.prepare(
    `SELECT consent_status FROM sms_subscription_state WHERE phone_contact_id = ? AND program = 'operational'`
  )
    .bind(contact.id)
    .first<{ consent_status: string }>();

  if (pending?.consent_status === 'pending') {
    await recordConsentEvent(env, {
      phoneContactId: contact.id,
      program: 'operational',
      category: null,
      action: 'verification_completed',
      statusAfter: 'active',
      source: 'web',
      uiSurface: '/settings/notifications',
    });

    // Program-level opt-in confirmation -- not category-gated (no category
    // is enabled yet at this point, Step 3 hasn't happened), so this goes
    // through sendSms() directly rather than sendOperationalSms(), the same
    // way the OTP message itself bypasses category authorization.
    await sendSms(env, normalized, OPT_IN_CONFIRMATION_TEXT);
  }

  return json({ ok: true }, headers);
}

export async function handleSetCategories(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body = (await request.json()) as { categories?: Record<string, boolean> };
  if (!body.categories) return json({ error: 'categories required' }, headers, 400);

  const contact = await findVerifiedPhoneContact(env);
  if (!contact) return json({ error: 'no_phone_contact' }, headers, 400);
  if (!contact.verified_at) return json({ error: 'phone_not_verified' }, headers, 400);

  const state = await env.DB.prepare(
    `SELECT consent_status FROM sms_subscription_state WHERE phone_contact_id = ? AND program = 'operational'`
  )
    .bind(contact.id)
    .first<{ consent_status: string }>();
  if (state?.consent_status !== 'active') return json({ error: 'operational_consent_not_active' }, headers, 400);

  for (const [category, enabled] of Object.entries(body.categories)) {
    if (!ALL_CATEGORIES.includes(category as ConsentCategory)) continue;
    await setCategoryEnabled(env, contact.id, category as ConsentCategory, enabled);
  }

  return json({ ok: true }, headers);
}

export async function handleWithdraw(env: Env, headers: HeadersInit): Promise<Response> {
  const contact = await findVerifiedPhoneContact(env);
  if (!contact) return json({ error: 'no_phone_contact' }, headers, 400);

  for (const category of ALL_CATEGORIES) {
    await setCategoryEnabled(env, contact.id, category, false);
  }
  await recordConsentEvent(env, {
    phoneContactId: contact.id,
    program: 'operational',
    category: null,
    action: 'withdrawn',
    statusAfter: 'revoked',
    source: 'web',
    uiSurface: '/settings/notifications',
  });

  return json({ ok: true }, headers);
}

const NOTIFICATIONS_PATHS = new Set([
  '/api/v1/sms/consent-text',
  '/api/me/notification-preferences',
  '/api/me/notification-preferences/sms',
  '/api/me/phone/verification/start',
  '/api/me/phone/verification/confirm',
  '/api/me/sms/withdraw',
]);

export async function handleNotificationsRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (!NOTIFICATIONS_PATHS.has(pathname)) return null;

  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { headers });

  if (pathname === '/api/v1/sms/consent-text' && request.method === 'GET') {
    return handleGetConsentText(headers);
  }
  if (pathname === '/api/me/notification-preferences' && request.method === 'GET') {
    return handleGetPreferences(env, headers);
  }
  if (pathname === '/api/me/notification-preferences/sms' && request.method === 'PUT') {
    return handleSetCategories(request, env, headers);
  }
  if (pathname === '/api/me/phone/verification/start' && request.method === 'POST') {
    return handleVerificationStart(request, env, headers);
  }
  if (pathname === '/api/me/phone/verification/confirm' && request.method === 'POST') {
    return handleVerificationConfirm(request, env, headers);
  }
  if (pathname === '/api/me/sms/withdraw' && request.method === 'POST') {
    return handleWithdraw(env, headers);
  }
  return null;
}
