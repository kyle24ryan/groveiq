// Layer IDs, labels, and ordering for the environmental context map.
//
// The brief this panel was rebuilt from
// ("GroveIQ-Mapbox-Implementation-Brief-for-Claude.md", 2026-08-17)
// proposes a restructure into four operational modes (Situation / Storms /
// Air & fire / Heat & sun). As of steps 3-5 (native NWS alerts + animated
// radar, PurpleAir sensors, NASA FIRMS fire detections, NOAA HMS smoke),
// two of those modes now have real content and are renamed accordingly:
// "Precipitation" -> "Storms" (radar + active NWS alerts) and "Local air"
// -> "Air & fire" (local AQI ring + PurpleAir community sensors + FIRMS
// hotspots + HMS smoke plumes). "Situation" (auto-selected default layer)
// and "Heat & sun" still have no defined/real content, so they are NOT
// added as layer buttons here -- same half-finished-scaffolding concern as
// before (see CHECKLIST.md's Mapbox environmental-context section).
export type MapLayerId = 'impact' | 'wind' | 'airFire' | 'storms';

export const LAYER_CATALOG: { id: MapLayerId; label: string }[] = [
  { id: 'impact', label: 'Grove impact' },
  { id: 'wind', label: 'Wind at grove' },
  { id: 'airFire', label: 'Air & fire' },
  { id: 'storms', label: 'Storms' },
];
