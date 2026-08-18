import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { fetchNearbySensors, sensorsToGeoJson } from '../purpleair';

async function handleSensors(env: Env, headers: HeadersInit): Promise<Response> {
  try {
    const sensors = await fetchNearbySensors(env);
    if (sensors === null) {
      return Response.json({ error: 'PURPLEAIR_API_KEY not configured' }, { status: 501, headers });
    }
    return Response.json(sensorsToGeoJson(sensors), { headers });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502, headers });
  }
}

export async function handlePurpleAirRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS' && pathname === '/api/v1/purpleair/sensors') {
    return new Response(null, { headers });
  }
  if (pathname === '/api/v1/purpleair/sensors' && request.method === 'GET') {
    return handleSensors(env, headers);
  }
  return null;
}
