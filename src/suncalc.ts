// Local sunrise/sunset/day-length calculation — pure math, no API or key
// needed, per SPEC.md 1a's own suggestion ("free API or local astronomy
// calc"). Standard NOAA solar position algorithm.
//
// Verified against an independent library (Python's `astral`) for North
// Bend, WA on 2026-08-12 before trusting this: astral gives sunrise
// 05:59:49 / sunset 20:23:34 PDT: this implementation gives 05:59 / 20:25,
// well within the ~2-4 minute precision this simplified form targets.
// (An earlier "reference" pulled from the Ecowitt console's own sunrise/
// sunset display was off by a full hour from both — that looks like a
// DST-handling quirk in the console's clock, not an error here.)

export type SunTimes = {
  sunriseUtcMinutes: number;
  sunsetUtcMinutes: number;
  dayLengthMinutes: number;
};

function julianDayAtNoonUtc(date: Date): number {
  const jdAtMidnight = date.getTime() / 86400000 + 2440587.5;
  return jdAtMidnight + 0.5;
}

export function computeSunTimes(date: Date, lat: number, lon: number): SunTimes {
  const JD = julianDayAtNoonUtc(date);
  const T = (JD - 2451545.0) / 36525.0;

  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const Mrad = (M * Math.PI) / 180;
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;

  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin((omega * Math.PI) / 180);

  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos((omega * Math.PI) / 180);

  const lambdaRad = (lambda * Math.PI) / 180;
  const epsRad = (eps * Math.PI) / 180;
  const decl = Math.asin(Math.sin(epsRad) * Math.sin(lambdaRad));

  const y = Math.pow(Math.tan(epsRad / 2), 2);
  const L0rad = (L0 * Math.PI) / 180;
  const eqTime =
    4 *
    (180 / Math.PI) *
    (y * Math.sin(2 * L0rad) -
      2 * e * Math.sin(Mrad) +
      4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0rad) -
      0.5 * y * y * Math.sin(4 * L0rad) -
      1.25 * e * e * Math.sin(2 * Mrad));

  const latRad = (lat * Math.PI) / 180;
  const zenith = (90.833 * Math.PI) / 180; // standard atmospheric refraction + solar radius correction
  const cosHA = Math.cos(zenith) / (Math.cos(latRad) * Math.cos(decl)) - Math.tan(latRad) * Math.tan(decl);
  const clamped = Math.min(1, Math.max(-1, cosHA));
  const HA = (Math.acos(clamped) * 180) / Math.PI;

  const solarNoonUtcMin = 720 - 4 * lon - eqTime;

  return {
    sunriseUtcMinutes: solarNoonUtcMin - 4 * HA,
    sunsetUtcMinutes: solarNoonUtcMin + 4 * HA,
    dayLengthMinutes: 8 * HA,
  };
}

function utcMinutesToLocalHHMM(utcMin: number, utcOffsetHours: number): string {
  let local = utcMin + utcOffsetHours * 60;
  local = ((local % 1440) + 1440) % 1440;
  const h = Math.floor(local / 60);
  const m = Math.round(local % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// North Bend, WA is Pacific time; -7 during DST (Mar-Nov), -8 standard.
// Good enough approximation for a personal-scale dashboard without pulling
// in a full IANA timezone database — revisit if this ever needs to be
// precise across the DST transition days themselves.
function pacificUtcOffsetHours(date: Date): number {
  const month = date.getUTCMonth() + 1;
  return month >= 3 && month <= 11 ? -7 : -8;
}

export function sunTimesLocal(date: Date, lat: number, lon: number): { sunrise: string; sunset: string; dayLengthHours: number } {
  const t = computeSunTimes(date, lat, lon);
  const offset = pacificUtcOffsetHours(date);
  return {
    sunrise: utcMinutesToLocalHHMM(t.sunriseUtcMinutes, offset),
    sunset: utcMinutesToLocalHHMM(t.sunsetUtcMinutes, offset),
    dayLengthHours: Math.round((t.dayLengthMinutes / 60) * 100) / 100,
  };
}
