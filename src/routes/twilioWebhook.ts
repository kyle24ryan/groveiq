// Twilio inbound messaging webhook (section 11.2). Handles STOP/START/HELP
// keywords for the operational SMS program.
//
// IMPORTANT DEPLOYMENT NOTE: this path must be reachable by Twilio's
// servers WITHOUT going through Cloudflare Access's GitHub-SSO gate --
// Twilio can't complete an interactive login. It needs its own Access
// "Bypass" policy scoped to exactly this path (or full path exclusion),
// configured in the dashboard. Authentication here is instead the Twilio
// request signature (HMAC using the Auth Token), which is why signature
// validation below is not optional. See CHECKLIST.md for setup status.

import type { Env } from '../env';
import { validateTwilioSignature } from '../sms/twilio';
import { normalizeE164, hashPhone } from '../sms/crypto';
import { recordConsentEvent, ALL_CATEGORIES } from '../sms/consent';

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);
const START_KEYWORDS = new Set(['START', 'UNSTOP']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

function twiml(): Response {
  // Empty <Response/> -- we don't send our own auto-reply here. STOP/HELP
  // confirmations are configured in Twilio's Advanced Opt-Out settings so
  // there's exactly one reply, not a duplicate from both Twilio and us.
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function handleTwilioWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.TWILIO_AUTH_TOKEN) {
    return new Response('Twilio not configured', { status: 500 });
  }

  const bodyText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));

  const signature = request.headers.get('X-Twilio-Signature');
  const fullUrl = request.url;
  const valid = await validateTwilioSignature(env.TWILIO_AUTH_TOKEN, fullUrl, params, signature);
  if (!valid) {
    // Reject without mutating any consent state (section 11.2.2).
    return new Response('Invalid signature', { status: 403 });
  }

  const messageSid = params.MessageSid;
  const from = params.From;
  const optOutType = params.OptOutType as string | undefined; // set when Twilio Advanced Opt-Out is enabled
  const bodyUpper = (params.Body ?? '').trim().toUpperCase();

  if (!messageSid || !from) {
    return twiml();
  }

  const normalized = normalizeE164(from);
  if (!normalized) return twiml();

  const hash = await hashPhone(env, normalized);
  const contact = await env.DB.prepare('SELECT id FROM phone_contacts WHERE phone_hash = ?').bind(hash).first<{ id: string }>();
  if (!contact) return twiml(); // message from a number we have no record of -- nothing to reconcile

  const keyword = optOutType ?? (STOP_KEYWORDS.has(bodyUpper) ? 'STOP' : START_KEYWORDS.has(bodyUpper) ? 'START' : HELP_KEYWORDS.has(bodyUpper) ? 'HELP' : null);

  try {
    if (keyword === 'STOP') {
      // STOP is high-priority and synchronous (section 12.1) -- suppress
      // immediately, before any other processing.
      await recordConsentEvent(env, {
        phoneContactId: contact.id,
        program: 'operational',
        category: null,
        action: 'stop_received',
        statusAfter: 'opted_out',
        source: 'sms_keyword',
        twilioMessageSid: messageSid,
        twilioOptOutType: optOutType ?? 'STOP',
      });
      // Also disable every category so authorizeOperationalSend's category
      // check fails closed even if subscription-state reconciliation lags.
      for (const category of ALL_CATEGORIES) {
        await env.DB.prepare(
          `INSERT INTO sms_category_subscriptions (user_id, phone_contact_id, category, enabled, updated_at)
           VALUES ('kyle', ?, ?, 0, datetime('now'))
           ON CONFLICT(user_id, phone_contact_id, category) DO UPDATE SET enabled = 0, updated_at = datetime('now')`
        )
          .bind(contact.id, category)
          .run();
      }
    } else if (keyword === 'START') {
      // Conservative re-enrollment per section 12.3: restore program-level
      // consent, leave every category Off until the user re-selects them.
      await recordConsentEvent(env, {
        phoneContactId: contact.id,
        program: 'operational',
        category: null,
        action: 'start_received',
        statusAfter: 'active',
        source: 'sms_keyword',
        twilioMessageSid: messageSid,
        twilioOptOutType: optOutType ?? 'START',
      });
    } else if (keyword === 'HELP') {
      await recordConsentEvent(env, {
        phoneContactId: contact.id,
        program: 'operational',
        category: null,
        action: 'help_received',
        statusAfter: 'active', // HELP does not change consent state (section 12.2)
        source: 'sms_keyword',
        twilioMessageSid: messageSid,
        twilioOptOutType: optOutType ?? 'HELP',
      });
    }
  } catch (err) {
    // Unique index on twilio_message_sid makes this idempotent -- a
    // duplicate webhook delivery for the same MessageSid throws here and
    // is treated as already-processed, not an error (section 11.2.9).
    if (!String(err).includes('UNIQUE constraint')) throw err;
  }

  return twiml();
}
