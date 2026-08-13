import type { Env } from './env';
import { handleIrrigationRoute } from './routes/irrigation';
import { handleConditionsRoute } from './routes/conditions';
import { handlePhotosRoute } from './routes/photos';
import { fetchEcowittRealTime, writeConditionsReading } from './ecowitt';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      const { results } = await env.DB.prepare('SELECT COUNT(*) as count FROM trees').all();
      return Response.json({ status: 'ok', trees: results[0]?.count ?? 0 });
    }

    if (url.pathname.startsWith('/api/v1/irrigation/')) {
      const response = await handleIrrigationRoute(request, env, url.pathname);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/v1/conditions/')) {
      const response = await handleConditionsRoute(request, env, url.pathname);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/v1/trees/') || url.pathname.startsWith('/api/v1/photos/')) {
      const response = await handlePhotosRoute(request, env, url.pathname);
      if (response) return response;
    }

    // TODO: temporary, for verifying the real Ecowitt payload shape (SPEC.md
    // Phase 1 step 5). Remove or gate behind auth once verification is done.
    if (url.pathname === '/api/debug/ecowitt') {
      try {
        const reading = await fetchEcowittRealTime(env);
        return Response.json(reading ?? { error: 'ECOWITT_APPLICATION_KEY/ECOWITT_API_KEY/ECOWITT_MAC not configured' });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 502 });
      }
    }

    return new Response('GroveIQ API — Phase 0 skeleton', {
      headers: { 'content-type': 'text/plain' },
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const reading = await fetchEcowittRealTime(env);
    if (!reading) return; // credentials not configured
    await writeConditionsReading(env, reading);
    // Soil channels intentionally unwritten — WH52 sensors haven't arrived
    // yet, so reading.soilChannels is always empty right now. Wire up
    // soil_readings writes once they're mapped to real trees.
  },
};
