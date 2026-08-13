import type { Env } from './env';
import { handleIrrigationRoute } from './routes/irrigation';
import { handleConditionsRoute } from './routes/conditions';
import { handlePhotosRoute } from './routes/photos';
import { handleAlertsRoute } from './routes/alerts';
import { fetchEcowittRealTime, writeConditionsReading } from './ecowitt';
import { evaluateConditionAlerts } from './alerts';

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

    if (url.pathname.startsWith('/api/v1/alerts/')) {
      const response = await handleAlertsRoute(request, env, url.pathname);
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

    // TODO: temporary, for testing the alert trigger/resolve state machine
    // with synthetic values without waiting for real extreme weather.
    if (url.pathname === '/api/debug/alerts-test') {
      const wind = url.searchParams.get('wind');
      const heat = url.searchParams.get('heat');
      const aqi = url.searchParams.get('aqi');
      await evaluateConditionAlerts(env, {
        outdoorTempC: null,
        humidityPct: null,
        windMph: wind !== null ? Number(wind) : null,
        windGustMph: null,
        windDirDeg: null,
        rainRateIn: null,
        rainDailyIn: null,
        pressureHpa: null,
        solarWm2: null,
        uvi: null,
        pm25: null,
        pm25Aqi: aqi !== null ? Number(aqi) : null,
        pm25Aqi24h: null,
        blackGlobeTempC: null,
        wbgtC: heat !== null ? Number(heat) : null,
      });
      const { results } = await env.DB.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 10').all();
      return Response.json({ alerts: results });
    }

    return new Response('GroveIQ API — Phase 0 skeleton', {
      headers: { 'content-type': 'text/plain' },
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const reading = await fetchEcowittRealTime(env);
    if (!reading) return; // credentials not configured
    await writeConditionsReading(env, reading);
    await evaluateConditionAlerts(env, reading.conditions);
    // Soil channels intentionally unwritten — WH52 sensors haven't arrived
    // yet, so reading.soilChannels is always empty right now. Wire up
    // soil_readings writes once they're mapped to real trees.
  },
};
