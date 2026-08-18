// Layer IDs, labels, and ordering for the environmental context map.
//
// Scoped to layers that have real content today. The brief this panel was
// rebuilt from ("GroveIQ-Mapbox-Implementation-Brief-for-Claude.md",
// 2026-08-17) proposes a further restructure into four operational modes
// (Situation / Storms / Air & fire / Heat & sun), but three of those modes
// depend on data sources that don't exist yet (NWS alerts, PurpleAir
// sensors, NOAA smoke, FIRMS fire, a Situation auto-selection algorithm).
// Introducing empty mode buttons now would be exactly the kind of
// half-finished scaffolding this project avoids elsewhere -- that
// restructure happens once those data sources are wired in (see
// CHECKLIST.md's Mapbox environmental-context section).
//
// Two renames from the brief ARE applied now, since they cost nothing and
// are honest about current content: "Air & smoke" -> "Local air" (no
// smoke rendered yet) and "Wind exposure" -> "Wind at grove" (a point
// glyph, not a regional velocity field).
export type MapLayerId = 'impact' | 'wind' | 'air' | 'precipitation';

export const LAYER_CATALOG: { id: MapLayerId; label: string }[] = [
  { id: 'impact', label: 'Grove impact' },
  { id: 'wind', label: 'Wind at grove' },
  { id: 'air', label: 'Local air' },
  { id: 'precipitation', label: 'Precipitation' },
];
