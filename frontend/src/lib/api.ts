const API_ORIGIN = 'https://api.grove-iq.com';
const API_BASE = `${API_ORIGIN}/api/v1`;

// credentials: 'include' on every call so the browser sends the Cloudflare
// Access session cookie cross-origin (grove-iq.com -> api.grove-iq.com).
// Without this, requests would silently drop the cookie and get redirected
// to the Access login page instead of returning JSON.
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
