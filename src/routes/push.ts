import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { sendPushToAll } from '../push';

type SubscribeBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

async function handleVapidPublicKey(env: Env, headers: HeadersInit): Promise<Response> {
  if (!env.VAPID_PUBLIC_KEY) {
    return Response.json({ error: 'push_not_configured' }, { status: 503, headers });
  }
  return Response.json({ publicKey: env.VAPID_PUBLIC_KEY }, { headers });
}

async function handleSubscribe(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body = (await request.json()) as Partial<SubscribeBody>;
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return Response.json({ error: 'invalid_subscription' }, { status: 400, headers });
  }

  await env.DB.prepare(
    `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, last_seen_at = datetime('now')`
  )
    .bind(crypto.randomUUID(), body.endpoint, body.keys.p256dh, body.keys.auth)
    .run();

  return Response.json({ ok: true }, { headers });
}

async function handleUnsubscribe(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body = (await request.json()) as { endpoint?: string };
  if (!body.endpoint) {
    return Response.json({ error: 'endpoint_required' }, { status: 400, headers });
  }
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(body.endpoint).run();
  return Response.json({ ok: true }, { headers });
}

async function handleTest(env: Env, headers: HeadersInit): Promise<Response> {
  const result = await sendPushToAll(env, {
    title: 'GroveIQ test notification',
    body: 'If you can see this, push notifications are working.',
    url: '/',
  });
  return Response.json(result, { headers });
}

export async function handlePushRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (!pathname.startsWith('/api/v1/push/')) return null;

  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { headers });

  if (pathname === '/api/v1/push/vapid-public-key' && request.method === 'GET') {
    return handleVapidPublicKey(env, headers);
  }
  if (pathname === '/api/v1/push/subscribe' && request.method === 'POST') {
    return handleSubscribe(request, env, headers);
  }
  if (pathname === '/api/v1/push/unsubscribe' && request.method === 'POST') {
    return handleUnsubscribe(request, env, headers);
  }
  if (pathname === '/api/v1/push/test' && request.method === 'POST') {
    return handleTest(env, headers);
  }
  return null;
}
