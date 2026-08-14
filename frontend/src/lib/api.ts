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
};

export async function fetchRegionalAqi(): Promise<RegionalAqi | null> {
  const res = await apiFetch(`${API_BASE}/regional-aqi/latest`);
  if (!res.ok) throw new Error(`regional-aqi failed: ${res.status}`);
  const body = (await res.json()) as { observation: RegionalAqi | null };
  return body.observation;
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
