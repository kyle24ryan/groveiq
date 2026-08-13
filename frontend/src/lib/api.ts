const API_BASE = 'https://api.grove-iq.com/api/v1';

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
  battery_sensor_array_code: number | null;
  battery_pm25_ch1_code: number | null;
  battery_bgt_voltage_v: number | null;
};

export async function fetchLatestConditions(): Promise<ConditionsReading | null> {
  const res = await fetch(`${API_BASE}/conditions/latest`);
  if (!res.ok) throw new Error(`conditions/latest failed: ${res.status}`);
  const body = (await res.json()) as { reading: ConditionsReading | null };
  return body.reading;
}

export async function fetchConditionsHistory(hours = 24): Promise<ConditionsReading[]> {
  const res = await fetch(`${API_BASE}/conditions/history?hours=${hours}`);
  if (!res.ok) throw new Error(`conditions/history failed: ${res.status}`);
  const body = (await res.json()) as { readings: ConditionsReading[] };
  return body.readings;
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
