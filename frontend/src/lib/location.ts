// Must match GROVE_LAT/GROVE_LON in the backend's src/nws.ts -- kept as a
// separate constant since frontend and Worker are independent TS projects.
// Confirmed to resolve to North Bend, WA specifically (NWS gridId SEW),
// not a generic Seattle station.
export const GROVE_LAT = 47.49;
export const GROVE_LON = -121.7871;
