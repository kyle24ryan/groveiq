// Centralized send service (section 11.3). This is the ONLY place that
// should call sms/twilio.ts's sendSms() for operational alerts -- no
// alternate code path, admin action, or direct Twilio call may bypass
// the consent check here.

import type { Env } from '../env';
import { authorizeOperationalSend, type ConsentCategory } from './consent';
import { decryptPhone } from './crypto';
import { sendSms } from './twilio';

type SendParams = {
  phoneContactId: string;
  category: ConsentCategory;
  body: string;
  templateVersion: string;
};

async function logSend(
  env: Env,
  params: { phoneContactId: string | null; category: string; templateVersion: string; status: 'sent' | 'failed' | 'blocked'; blockReason?: string; twilioSid?: string }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO sms_send_log (id, phone_contact_id, program, category, template_version, twilio_sid, status, block_reason)
     VALUES (?, ?, 'operational', ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), params.phoneContactId, params.category, params.templateVersion, params.twilioSid ?? null, params.status, params.blockReason ?? null)
    .run();
}

export async function sendOperationalSms(env: Env, params: SendParams): Promise<{ sent: boolean; reason?: string }> {
  const auth = await authorizeOperationalSend(env, params.phoneContactId, params.category);
  if (!auth.allowed) {
    await logSend(env, { ...params, status: 'blocked', blockReason: auth.reason });
    return { sent: false, reason: auth.reason };
  }

  const contact = await env.DB.prepare('SELECT phone_encrypted FROM phone_contacts WHERE id = ?')
    .bind(params.phoneContactId)
    .first<{ phone_encrypted: string }>();
  if (!contact) {
    await logSend(env, { ...params, status: 'blocked', blockReason: 'contact_missing_after_authorization' });
    return { sent: false, reason: 'contact_missing_after_authorization' };
  }

  const phone = await decryptPhone(env, contact.phone_encrypted);
  const result = await sendSms(env, phone, params.body);

  if ('error' in result) {
    await logSend(env, { ...params, status: 'failed', blockReason: result.error });
    return { sent: false, reason: result.error };
  }

  await logSend(env, { ...params, status: 'sent', twilioSid: result.sid });
  return { sent: true };
}
