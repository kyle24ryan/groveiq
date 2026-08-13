import type { Env } from './env';

export async function sendAlertEmail(env: Env, subject: string, body: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO) return; // not configured, no-op

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'GroveIQ <onboarding@resend.dev>',
      to: [env.ALERT_EMAIL_TO],
      subject,
      text: body,
    }),
  });

  if (!res.ok) {
    console.error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}
