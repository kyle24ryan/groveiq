// Must match GROVE_LAT/GROVE_LON in the backend's src/nws.ts -- kept as a
// separate constant since frontend and Worker are independent TS projects.
// User-provided GPS coordinates (2026-08-17) -- the previous value was an
// approximate North Bend, WA location, not the actual grove site.
// Confirmed to resolve to NWS gridId SEW, gridX 142, gridY 58.
export const GROVE_LAT = 47.4776620;
export const GROVE_LON = -121.7300978;
