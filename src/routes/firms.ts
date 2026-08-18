import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { fetchActiveFires, detectionsToGeoJson } from '../firms';

async function handleActiveFires(env: Env, headers: HeadersInit): Promise<Response> {
  try {
    const detections = await fetchActiveFires(env);
    if (detections === null) {
      return Response.json({ error: 'NASA_FIRMS_MAP_KEY not configured' }, { status: 501, headers });
    }
    return Response.json(detectionsToGeoJson(detections), { headers });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502, headers });
  }
}

export async function handleFirmsRoute(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS' && pathname === '/api/v1/firms/active-fires') {
    return new Response(null, { headers });
  }
  if (pathname === '/api/v1/firms/active-fires' && request.method === 'GET') {
    return handleActiveFires(env, headers);
  }
  return null;
}
