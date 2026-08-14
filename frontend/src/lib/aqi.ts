import type { Status } from '../data/types';

// Standard US EPA AQI categories, mapped to our ok/watch/urgent language.
// Single source of truth -- shared by Environment's AQI card and the
// spatial map's "Air & smoke" layer so they can't disagree.
export function aqiCategory(aqi: number): { label: string; status: Status } {
  if (aqi <= 50) return { label: 'Good', status: 'ok' };
  if (aqi <= 100) return { label: 'Moderate', status: 'watch' };
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', status: 'watch' };
  if (aqi <= 200) return { label: 'Unhealthy', status: 'urgent' };
  if (aqi <= 300) return { label: 'Very unhealthy', status: 'urgent' };
  return { label: 'Hazardous', status: 'urgent' };
}
