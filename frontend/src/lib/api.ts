// Same-origin in production (grove-iq.com/api/* is routed to the Worker --
// see wrangler.toml) so the browser never sends a cross-origin CORS
// preflight to api.grove-iq.com. That preflight is unauthenticated by the
// fetch spec (browsers never attach credentials to it), and Cloudflare
// Access blocks anonymous requests with a bare 403 and no CORS headers --
// which broke every POST/PUT call once Access went in front of
// api.grove-iq.com. Same-origin requests never preflight, sidestepping the
// conflict entirely. Local dev has no same-origin Worker, so it falls back
// to the live cross-origin API (fine for the GET-only screens tested from
// localhost; POST/PUT flows need testing against the deployed site).
const API_ORIGIN = typeof window !== 'undefined' && window.location.hostname === 'grove-iq.com' ? '' : 'https://api.grove-iq.com';
const API_BASE = `${API_ORIGIN}/api/v1`;

function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: 'include' });
}

export type ConditionsReading = {
  id: number;
  ts: string;
  outdoor_temp_c: number | null;
  humidity_pct: number | null;
  wind_mph: number | null;
  wind_dir_deg: number | null;
  rain_in: number | null;
  pressure_hpa: number | null;
  solar_wm2: number | null;
  uvi: number | null;
  black_globe_temp_c: number | null;
  wbgt_c: number | null;
  pm25: number | null;
  pm25_aqi: number | null;
  pm25_aqi_24h: number | null;
  battery_sensor_array_code: number | null;
  battery_pm25_ch1_code: number | null;
  battery_bgt_voltage_v: number | null;
};

export async function fetchLatestConditions(): Promise<ConditionsReading | null> {
  const res = await apiFetch(`${API_BASE}/conditions/latest`);
  if (!res.ok) throw new Error(`conditions/latest failed: ${res.status}`);
  const body = (await res.json()) as { reading: ConditionsReading | null };
  return body.reading;
}

export async function fetchConditionsHistory(hours = 24): Promise<ConditionsReading[]> {
  const res = await apiFetch(`${API_BASE}/conditions/history?hours=${hours}`);
  if (!res.ok) throw new Error(`conditions/history failed: ${res.status}`);
  const body = (await res.json()) as { readings: ConditionsReading[] };
  return body.readings;
}

export type DailyConditionsRow = {
  date: string;
  outdoor_temp_avg: number | null;
  outdoor_temp_min: number | null;
  humidity_avg: number | null;
  wind_max: number | null;
  rain_total: number | null;
  black_globe_max: number | null;
  pm25_avg: number | null;
};

export async function fetchDailyConditionsHistory(days = 30): Promise<DailyConditionsRow[]> {
  const res = await apiFetch(`${API_BASE}/conditions/daily-history?days=${days}`);
  if (!res.ok) throw new Error(`conditions/daily-history failed: ${res.status}`);
  const body = (await res.json()) as { readings: DailyConditionsRow[] };
  return body.readings;
}

export type PhotoAnalysis = {
  id: number;
  kind: string;
  source: string | null;
  status: 'ok' | 'watch' | 'urgent' | null;
  summary: string | null;
  detail: string | null;
  model: string | null;
  photo_r2_key: string | null;
  photo_url: string | null;
  ts: string;
};

export type SoilReading = {
  id: number;
  tree_id: string;
  ts: string;
  soil_moisture_pct: number | null;
  soil_temp_c: number | null;
  soil_ec: number | null;
};

export async function fetchSoilReadings(treeId: string, hours = 720): Promise<SoilReading[]> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/soil-readings?hours=${hours}`);
  if (!res.ok) throw new Error(`soil-readings fetch failed: ${res.status}`);
  const body = (await res.json()) as { readings: SoilReading[] };
  return body.readings;
}

// Shape matches daily_readings (schema.sql) -- real daily rollups, written
// by the 13:00 UTC cron (src/dailyRollup.ts). Distinct from SoilReading's
// 5-min raw granularity: this is for trend charts/history, soil-readings
// is for "what's the current reading right now."
export type DailyReadingRow = {
  date: string;
  soil_moisture_avg: number | null;
  soil_moisture_min: number | null;
  soil_moisture_max: number | null;
  soil_temp_avg: number | null;
  soil_ec_avg: number | null;
  outdoor_temp_avg: number | null;
  outdoor_temp_min: number | null;
  humidity_avg: number | null;
  wind_max: number | null;
  rain_total: number | null;
  black_globe_max: number | null;
  pm25_avg: number | null;
};

export async function fetchDailyReadings(treeId: string, days = 30): Promise<DailyReadingRow[]> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/daily-readings?days=${days}`);
  if (!res.ok) throw new Error(`daily-readings fetch failed: ${res.status}`);
  const body = (await res.json()) as { readings: DailyReadingRow[] };
  return body.readings;
}

export async function fetchTreeAnalyses(treeId: string): Promise<PhotoAnalysis[]> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/analyses`);
  if (!res.ok) throw new Error(`analyses fetch failed: ${res.status}`);
  const body = (await res.json()) as { analyses: PhotoAnalysis[] };
  return body.analyses;
}

export async function uploadTreePhoto(treeId: string, file: File): Promise<PhotoAnalysis> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  const body = (await res.json()) as PhotoAnalysis & { error?: string };
  if (!res.ok) throw new Error(body.error || `upload failed: ${res.status}`);
  return body;
}

export function photoUrl(relativePath: string): string {
  return `${API_ORIGIN}${relativePath}`;
}

export async function deleteTreeAnalysis(treeId: string, analysisId: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/analyses/${analysisId}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `delete failed: ${res.status}`);
  }
}

// --- Camera capture-request queue (spec: "Capture now" button) ---
// The Worker can't reach the camera or the local capture script directly
// (no public IP on the home network), so this just queues a request; a
// script polling in the background picks it up. See
// scripts/camera-capture/README.md for the other half of this flow.

export type CaptureRequest = {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  requested_at: string;
  completed_at: string | null;
  analysis_id: number | null;
  error: string | null;
};

export async function requestCapture(treeId: string): Promise<{ requestId: string; alreadyPending: boolean }> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/capture-request`, { method: 'POST' });
  const body = (await res.json()) as { ok: boolean; request_id?: string; already_pending?: boolean; error?: string };
  if (!res.ok || !body.ok || !body.request_id) throw new Error(body.error || `capture request failed: ${res.status}`);
  return { requestId: body.request_id, alreadyPending: !!body.already_pending };
}

export async function fetchLatestCaptureRequest(treeId: string): Promise<CaptureRequest | null> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/capture-request/latest`);
  if (!res.ok) throw new Error(`capture request status failed: ${res.status}`);
  const body = (await res.json()) as { request: CaptureRequest | null };
  return body.request;
}

// --- Irrigation watering-request queue (spec: "Water now" button) ---
// Same shape as the capture-request queue above: the Worker can't reach
// the ESP32 controller directly (no public IP on the home network), so
// this just queues a request; the device polls for it on its own cycle.

export type WaterRequest = {
  id: string;
  status: 'pending' | 'claimed' | 'completed' | 'aborted';
  ts: string;
  requested_duration_sec: number;
  actual_duration_sec: number | null;
  flow_confirmed: boolean | null;
  aborted_reason: string | null;
};

export async function requestWatering(treeId: string, durationSec: number): Promise<{ requestId: string; alreadyPending: boolean }> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/water-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration_sec: durationSec, trigger_source: 'manual' }),
  });
  const body = (await res.json()) as { ok: boolean; request_id?: string; already_pending?: boolean; error?: string };
  if (!res.ok || !body.ok || !body.request_id) throw new Error(body.error || `water request failed: ${res.status}`);
  return { requestId: body.request_id, alreadyPending: !!body.already_pending };
}

export async function fetchLatestWaterRequest(treeId: string): Promise<WaterRequest | null> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/water-request/latest`);
  if (!res.ok) throw new Error(`water request status failed: ${res.status}`);
  const body = (await res.json()) as { request: WaterRequest | null };
  return body.request;
}

export type IrrigationZone = { zone_id: string; last_watered_at: string | null; last_duration_sec: number | null };
export type IrrigationEvent = {
  id: string;
  ts: string;
  status: 'pending' | 'claimed' | 'completed' | 'aborted';
  trigger_source: 'manual' | 'scheduled' | 'sensor' | 'ai';
  requested_duration_sec: number;
  actual_duration_sec: number | null;
  flow_confirmed: boolean | null;
  aborted_reason: string | null;
};

// Zone config + recent watering history for a tree -- feeds useTreeInsights'
// shared last-watered/event data (Timeline and TreeDetail must not
// disagree about "when was this last watered", same reasoning as every
// other shared fact in that hook). A tree with no irrigation zone yet
// (4 of 5 trees today) returns { zone: null, events: [] }, not an error.
export async function fetchIrrigationZone(treeId: string): Promise<{ zone: IrrigationZone | null; events: IrrigationEvent[] }> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}/irrigation`);
  if (!res.ok) throw new Error(`irrigation zone fetch failed: ${res.status}`);
  return (await res.json()) as { zone: IrrigationZone | null; events: IrrigationEvent[] };
}

export type ActiveAlert = {
  id: number;
  alert_type: 'wind' | 'heat' | 'aqi' | string;
  tier: 'watch' | 'urgent';
  message: string;
  reading_value: number | null;
  triggered_at: string;
};

export async function fetchActiveAlerts(): Promise<ActiveAlert[]> {
  const res = await apiFetch(`${API_BASE}/alerts/active`);
  if (!res.ok) throw new Error(`alerts/active failed: ${res.status}`);
  const body = (await res.json()) as { alerts: ActiveAlert[] };
  return body.alerts;
}

export type ForecastDay = {
  date: string;
  low_temp_f: number | null;
  high_temp_f: number | null;
  wind_gust_mph: number | null;
  precip_chance_pct: number | null;
  frost_risk: number;
  fetched_at: string;
};

export async function fetchForecast(): Promise<ForecastDay[]> {
  const res = await apiFetch(`${API_BASE}/forecast`);
  if (!res.ok) throw new Error(`forecast failed: ${res.status}`);
  const body = (await res.json()) as { forecasts: ForecastDay[] };
  return body.forecasts;
}

export type SunTimes = { sunrise: string; sunset: string; dayLengthHours: number };

export async function fetchSunTimes(): Promise<SunTimes> {
  const res = await apiFetch(`${API_BASE}/sun`);
  if (!res.ok) throw new Error(`sun failed: ${res.status}`);
  return (await res.json()) as SunTimes;
}

export type RegionalAqi = {
  ts: string;
  airnow_aqi: number | null;
  airnow_category: string | null;
  reporting_area: string | null;
  discussion: string | null;
  // Calendar date (grove-local) the AQI value is actually valid for --
  // separate from `ts` (when GroveIQ fetched it). AirNow's forecast
  // endpoint can fall back to a non-"today" row right at a day boundary;
  // this is what lets the UI say "forecast for {forecast_date}" instead of
  // silently implying the number is for right now.
  forecast_date: string | null;
};

export async function fetchRegionalAqi(): Promise<RegionalAqi | null> {
  const res = await apiFetch(`${API_BASE}/regional-aqi/latest`);
  if (!res.ok) throw new Error(`regional-aqi failed: ${res.status}`);
  const body = (await res.json()) as { observation: RegionalAqi | null };
  return body.observation;
}

// --- NWS active weather alerts (Storms mode) ---

export type NwsAlertGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null;

export type NwsAlert = {
  id: string;
  event: string;
  severity: string;
  certainty: string;
  urgency: string;
  headline: string | null;
  areaDesc: string;
  effective: string | null;
  onset: string | null;
  expires: string | null;
  ends: string | null;
  senderName: string;
  webUrl: string;
  geometry: NwsAlertGeometry;
};

export async function fetchActiveWeatherAlerts(): Promise<NwsAlert[]> {
  const res = await apiFetch(`${API_BASE}/weather-alerts/active`);
  if (!res.ok) throw new Error(`weather-alerts/active failed: ${res.status}`);
  const body = (await res.json()) as { alerts: NwsAlert[] };
  return body.alerts;
}

// --- PurpleAir nearby community sensors, NASA FIRMS fire detections, NOAA
// HMS smoke plumes (Air & fire mode). All three return GeoJSON directly
// from the Worker (already normalized server-side), so the frontend types
// here just describe the `properties` bag each feature carries.

export type PurpleAirSensorProperties = {
  sensorIndex: number;
  name: string;
  pm25: number | null;
  aqi: number | null;
  aqiCategory: string | null;
  lastSeenIso: string | null;
  confidence: number | null;
  source: string;
};

export async function fetchPurpleAirSensors(): Promise<GeoJSON.FeatureCollection<GeoJSON.Point, PurpleAirSensorProperties> | null> {
  const res = await apiFetch(`${API_BASE}/purpleair/sensors`);
  if (res.status === 501) return null; // PURPLEAIR_API_KEY not configured
  if (!res.ok) throw new Error(`purpleair/sensors failed: ${res.status}`);
  return (await res.json()) as GeoJSON.FeatureCollection<GeoJSON.Point, PurpleAirSensorProperties>;
}

export type FirmsDetectionProperties = {
  acqDateIso: string;
  satellite: string;
  confidence: string;
  frpMw: number | null;
  daynight: 'Day' | 'Night' | null;
  distanceKm: number;
  bearingDeg: number;
  bearingCompass: string;
  source: string;
};

export async function fetchActiveFires(): Promise<GeoJSON.FeatureCollection<GeoJSON.Point, FirmsDetectionProperties> | null> {
  const res = await apiFetch(`${API_BASE}/firms/active-fires`);
  if (res.status === 501) return null; // NASA_FIRMS_MAP_KEY not configured
  if (!res.ok) throw new Error(`firms/active-fires failed: ${res.status}`);
  return (await res.json()) as GeoJSON.FeatureCollection<GeoJSON.Point, FirmsDetectionProperties>;
}

export type SmokePlumeProperties = {
  satellite: string;
  density: 'Light' | 'Medium' | 'Heavy' | 'Unknown';
  startTimeIso: string | null;
  endTimeIso: string | null;
  distanceFromGroveKm: number | null;
  source: string;
};

export async function fetchSmokePlumes(): Promise<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, SmokePlumeProperties>> {
  const res = await apiFetch(`${API_BASE}/smoke/plumes`);
  if (!res.ok) throw new Error(`smoke/plumes failed: ${res.status}`);
  return (await res.json()) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, SmokePlumeProperties>;
}

// Cron polls every 5 minutes; call it stale past 3x that so a couple of
// missed ticks don't immediately flip the badge.
const STALE_THRESHOLD_MS = 15 * 60 * 1000;

export function freshnessLabel(ts: string | null): { label: string; stale: boolean } {
  if (!ts) return { label: 'No data yet', stale: true };
  const ageMs = Date.now() - new Date(ts).getTime();
  const stale = ageMs > STALE_THRESHOLD_MS;
  const minutes = Math.round(ageMs / 60000);
  const label = minutes < 1 ? 'Live · just now' : minutes < 60 ? `Live · ${minutes}m ago` : `Stale · ${Math.round(minutes / 60)}h ago`;
  return { label: stale ? label.replace('Live', 'Stale') : label, stale };
}

// --- SMS/MMS notification consent (spec: GROVEIQ_TWILIO_SMS_REQUIREMENTS.md) ---
// Note: these routes are /api/me/... and /api/v1/sms/..., not under
// API_BASE's /api/v1 prefix uniformly -- matching the doc's section 11
// URL convention exactly, not this file's existing API_BASE pattern.

export type ConsentTextResponse = {
  text: string;
  version: string;
  categories: Record<string, { label: string; example: string }>;
};

export async function fetchConsentText(): Promise<ConsentTextResponse> {
  const res = await apiFetch(`${API_ORIGIN}/api/v1/sms/consent-text`);
  if (!res.ok) throw new Error(`consent-text failed: ${res.status}`);
  return (await res.json()) as ConsentTextResponse;
}

export type NotificationPreferences = {
  phone: string | null;
  phoneVerified: boolean;
  operationalConsent: 'pending' | 'active' | 'opted_out' | 'suppressed' | 'revoked';
  categories: Record<string, boolean>;
  consentTextVersion: string;
  privacyVersion: string;
  termsVersion: string;
};

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await apiFetch(`${API_ORIGIN}/api/me/notification-preferences`);
  if (!res.ok) throw new Error(`notification-preferences failed: ${res.status}`);
  return (await res.json()) as NotificationPreferences;
}

export async function startPhoneVerification(phone: string, operationalConsent: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`${API_ORIGIN}/api/me/phone/verification/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, operationalConsent }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true };
}

export async function confirmPhoneVerification(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`${API_ORIGIN}/api/me/phone/verification/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true };
}

export async function setNotificationCategories(categories: Record<string, boolean>): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`${API_ORIGIN}/api/me/notification-preferences/sms`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true };
}

export async function withdrawSmsConsent(): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`${API_ORIGIN}/api/me/sms/withdraw`, { method: 'POST' });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true };
}

// --- Push notifications ---

export async function fetchVapidPublicKey(): Promise<string> {
  const res = await apiFetch(`${API_BASE}/push/vapid-public-key`);
  if (!res.ok) throw new Error(`vapid-public-key failed: ${res.status}`);
  const body = (await res.json()) as { publicKey: string };
  return body.publicKey;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`${API_BASE}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true };
}

export async function unsubscribePush(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`${API_BASE}/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true };
}

export async function sendTestPush(): Promise<{ sent: number; failed: number }> {
  const res = await apiFetch(`${API_BASE}/push/test`, { method: 'POST' });
  if (!res.ok) throw new Error(`push test failed: ${res.status}`);
  return (await res.json()) as { sent: number; failed: number };
}

// --- Tree profile editing ---

export type TreeProfile = {
  id: string;
  name: string;
  nickname: string | null;
  species: string;
  pot_size_liters: number | null;
  origin_notes: string | null;
  origin_type: string | null;
  acquired_date: string | null;
  estimated_age_years_low: number | null;
  estimated_age_years_high: number | null;
  development_stage: string | null;
  notes: string | null;
  soil_moisture_threshold_low: number | null;
  soil_moisture_threshold_high: number | null;
  ec_threshold_high: number | null;
  dormancy_soil_temp_c: number | null;
  created_at: string;
};

export type TreeProfileEditableFields = Partial<
  Pick<
    TreeProfile,
    | 'name'
    | 'nickname'
    | 'pot_size_liters'
    | 'origin_notes'
    | 'origin_type'
    | 'acquired_date'
    | 'estimated_age_years_low'
    | 'estimated_age_years_high'
    | 'development_stage'
    | 'notes'
    | 'soil_moisture_threshold_low'
    | 'soil_moisture_threshold_high'
    | 'ec_threshold_high'
    | 'dormancy_soil_temp_c'
  >
>;

export async function fetchAllTreeProfiles(): Promise<TreeProfile[]> {
  const res = await apiFetch(`${API_BASE}/trees`);
  if (!res.ok) throw new Error(`trees fetch failed: ${res.status}`);
  const body = (await res.json()) as { trees: TreeProfile[] };
  return body.trees;
}

export async function fetchTreeProfile(treeId: string): Promise<TreeProfile> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}`);
  if (!res.ok) throw new Error(`tree fetch failed: ${res.status}`);
  const body = (await res.json()) as { tree: TreeProfile };
  return body.tree;
}

export async function updateTreeProfile(treeId: string, fields: TreeProfileEditableFields): Promise<TreeProfile> {
  const res = await apiFetch(`${API_BASE}/trees/${treeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = (await res.json()) as { tree?: TreeProfile; error?: string };
  if (!res.ok || !body.tree) throw new Error(body.error || `tree update failed: ${res.status}`);
  return body.tree;
}

// --- Grove/app settings ---

export type AppSettings = {
  collection_name?: string;
  owner_name?: string;
  location?: string;
  hardiness_zone?: string;
};

export async function fetchAppSettings(): Promise<AppSettings> {
  const res = await apiFetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error(`settings fetch failed: ${res.status}`);
  const body = (await res.json()) as { settings: AppSettings };
  return body.settings;
}

export async function updateAppSettings(fields: AppSettings): Promise<AppSettings> {
  const res = await apiFetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = (await res.json()) as { settings?: AppSettings; error?: string };
  if (!res.ok || !body.settings) throw new Error(body.error || `settings update failed: ${res.status}`);
  return body.settings;
}
