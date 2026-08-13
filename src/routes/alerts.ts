import type { Env } from '../env';
import { corsHeaders } from './conditions';

type AlertRow = {
  id: number;
  alert_type: string;
  tier: string;
  message: string;
  reading_value: number | null;
  triggered_at: string;
};

async function handleActive(env: Env, headers: HeadersInit): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, alert_type, tier, message, reading_value, triggered_at FROM alerts WHERE resolved_at IS NULL ORDER BY triggered_at DESC`
  ).all<AlertRow>();
  return Response.json({ alerts: results }, { headers });
}

export async function handleAlertsRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS' && pathname.startsWith('/api/v1/alerts/')) {
    return new Response(null, { headers });
  }
  if (pathname === '/api/v1/alerts/active' && request.method === 'GET') {
    return handleActive(env, headers);
  }
  return null;
}
