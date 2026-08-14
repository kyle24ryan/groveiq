import type { Env } from './env';
import { handleIrrigationRoute } from './routes/irrigation';
import { handleConditionsRoute } from './routes/conditions';
import { handlePhotosRoute } from './routes/photos';
import { handleAlertsRoute } from './routes/alerts';
import { handleForecastRoute } from './routes/forecast';
import { handleNotificationsRoute } from './routes/notifications';
import { handleTwilioWebhook } from './routes/twilioWebhook';
import { handleTreesRoute } from './routes/trees';
import { handleSettingsRoute } from './routes/settings';
import { handlePushRoute } from './routes/push';
import { handleCaptureRoute } from './routes/capture';
import { fetchEcowittRealTime, writeConditionsReading } from './ecowitt';
import { evaluateConditionAlerts, evaluateForecastAlerts } from './alerts';
import { fetchNwsForecast, writeForecasts } from './nws';
import { fetchAirNow, writeAirNowObservation } from './airnow';

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

    if (url.pathname === '/api/v1/trees' || url.pathname.startsWith('/api/v1/trees/')) {
      const response = await handleTreesRoute(request, env, url.pathname);
      if (response) return response;
    }

    if (url.pathname === '/api/v1/settings') {
      const response = await handleSettingsRoute(request, env, url.pathname);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/v1/push/')) {
      const response = await handlePushRoute(request, env, url.pathname);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/v1/capture/') || url.pathname.startsWith('/api/v1/trees/')) {
      const response = await handleCaptureRoute(request, env, url.pathname);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/v1/alerts/')) {
      const response = await handleAlertsRoute(request, env, url.pathname);
      if (response) return response;
    }

    if (url.pathname === '/api/v1/forecast' || url.pathname === '/api/v1/sun' || url.pathname === '/api/v1/regional-aqi/latest') {
      const response = await handleForecastRoute(request, env, url.pathname);
      if (response) return response;
    }

    {
      const response = await handleNotificationsRoute(request, env, url.pathname);
      if (response) return response;
    }

    if (url.pathname === '/api/webhooks/twilio/messaging' && request.method === 'POST') {
      return handleTwilioWebhook(request, env);
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

    // TODO: temporary, for testing the daily NWS/AirNow job on-demand
    // instead of waiting for the 13:00 UTC cron.
    if (url.pathname === '/api/debug/daily-job') {
      const result = await runDailyJob(env);
      return Response.json(result);
    }

    return new Response('GroveIQ API — Phase 0 skeleton', {
      headers: { 'content-type': 'text/plain' },
    });
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    if (event.cron === '0 13 * * *') {
      await runDailyJob(env);
      return;
    }

    // Default: the */5 * * * * Ecowitt poll.
    const reading = await fetchEcowittRealTime(env);
    if (!reading) return; // credentials not configured
    await writeConditionsReading(env, reading);
    await evaluateConditionAlerts(env, reading.conditions);
    // Soil channels intentionally unwritten — WH52 sensors haven't arrived
    // yet, so reading.soilChannels is always empty right now. Wire up
    // soil_readings writes once they're mapped to real trees.
  },
};

async function runDailyJob(env: Env): Promise<{ forecastDays: number; airnow: boolean; errors: string[] }> {
  const errors: string[] = [];
  let forecastDays = 0;
  let airnow = false;

  try {
    const days = await fetchNwsForecast();
    await writeForecasts(env, days);
    await evaluateForecastAlerts(env, days);
    forecastDays = days.length;
  } catch (err) {
    errors.push(`NWS: ${String(err)}`);
  }

  try {
    const obs = await fetchAirNow(env);
    if (obs) {
      await writeAirNowObservation(env, obs);
      airnow = true;
    }
  } catch (err) {
    errors.push(`AirNow: ${String(err)}`);
  }

  return { forecastDays, airnow, errors };
}
