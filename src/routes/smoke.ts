import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { fetchSmokePlumes } from '../hmsSmoke';

async function handleSmokePlumes(headers: HeadersInit): Promise<Response> {
  try {
    const plumes = await fetchSmokePlumes();
    return Response.json(plumes, { headers });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502, headers });
  }
}

export async function handleSmokeRoute(request: Request, _env: Env, pathname: string): Promise<Response | null> {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS' && pathname === '/api/v1/smoke/plumes') {
    return new Response(null, { headers });
  }
  if (pathname === '/api/v1/smoke/plumes' && request.method === 'GET') {
    return handleSmokePlumes(headers);
  }
  return null;
}
