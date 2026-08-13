import type { UnitSystem } from '../contexts/UnitsContext';

// Canonical storage units throughout the app: temp in Celsius, wind in mph,
// rain in inches, pressure in hPa. These functions convert only at the
// presentation boundary — nothing upstream (mock data, D1, analyzeTree's
// threshold math) should ever read a converted value.

export function convertTemp(celsius: number, system: UnitSystem): number {
  return system === 'us' ? (celsius * 9) / 5 + 32 : celsius;
}
export function tempUnit(system: UnitSystem): string {
  return system === 'us' ? '°F' : '°C';
}
export function formatTemp(celsius: number | null, system: UnitSystem, digits = 1): string {
  if (celsius === null) return '—';
  return convertTemp(celsius, system).toFixed(digits);
}

export function convertWindSpeed(mph: number, system: UnitSystem): number {
  return system === 'us' ? mph : mph * 1.60934;
}
export function windSpeedUnit(system: UnitSystem): string {
  return system === 'us' ? 'mph' : 'km/h';
}
export function formatWindSpeed(mph: number | null, system: UnitSystem, digits = 1): string {
  if (mph === null) return '—';
  return convertWindSpeed(mph, system).toFixed(digits);
}

export function convertRain(inches: number, system: UnitSystem): number {
  return system === 'us' ? inches : inches * 25.4;
}
export function rainUnit(system: UnitSystem): string {
  return system === 'us' ? 'in' : 'mm';
}
export function formatRain(inches: number | null, system: UnitSystem, digits?: number): string {
  if (inches === null) return '—';
  const resolvedDigits = digits ?? (system === 'us' ? 2 : 1);
  return convertRain(inches, system).toFixed(resolvedDigits);
}

export function convertPressure(hpa: number, system: UnitSystem): number {
  return system === 'us' ? hpa * 0.0295301 : hpa;
}
export function pressureUnit(system: UnitSystem): string {
  return system === 'us' ? 'inHg' : 'hPa';
}
export function formatPressure(hpa: number | null, system: UnitSystem, digits?: number): string {
  if (hpa === null) return '—';
  const resolvedDigits = digits ?? (system === 'us' ? 2 : 1);
  return convertPressure(hpa, system).toFixed(resolvedDigits);
}
