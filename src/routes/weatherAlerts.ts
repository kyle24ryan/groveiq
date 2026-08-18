// NWS active weather alerts for the grove's point location -- Storms mode
// (Mapbox brief step 3). Live-proxied, not cached in D1: alerts can be
// issued/cancelled/updated within minutes during an actual event, and
// api.weather.gov is free/keyless/generously rate-limited, so there's no
// reason to serve a stale D1 copy here the way the daily NWS forecast job
// does for forecasts.
import type { Env } from '../env';
import { corsHeaders } from './conditions';
import { fetchActiveAlerts } from '../nws';

async function handleActiveAlerts(headers: HeadersInit): Promise<Response> {
  try {
    const alerts = await fetchActiveAlerts();
    return Response.json({ alerts }, { headers });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502, headers });
  }
}

export async function handleWeatherAlertsRoute(request: Request, _env: Env, pathname: string): Promise<Response | null> {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS' && pathname === '/api/v1/weather-alerts/active') {
    return new Response(null, { headers });
  }
  if (pathname === '/api/v1/weather-alerts/active' && request.method === 'GET') {
    return handleActiveAlerts(headers);
  }
  return null;
}
