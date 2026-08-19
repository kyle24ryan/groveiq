# GroveIQ environmental-context map: implementation brief for Claude

Date: 2026-08-17  
Repository: `/Users/amyryan/Desktop/GroveIQ`  
Product location: a five-tree deck at one grove coordinate in North Bend, Washington

## Objective

Turn GroveIQ's existing Mapbox card into a useful, native environmental-context viewer. The map is supporting evidence for decisions about five trees on one deck; it must not become the star of the product or a generic weather app.

The map should answer:

- What is happening around the grove now?
- What is approaching the grove?
- Does regional context corroborate or explain GroveIQ's local sensors and alerts?
- Which tree or grove action, if any, does that context affect?

Do not use iframes. Use Mapbox GL JS sources and layers, GroveIQ Worker endpoints, and provider APIs/data feeds. Keep one grove marker rather than pretending five trees on the same deck are meaningfully separable on a regional map.

## Important repository state

Start with `git status --short` and preserve all existing work. At the time of this review, the working tree already had uncommitted edits in:

- `CHECKLIST.md`
- `frontend/src/components/spatial/GroveMap.tsx`
- `frontend/src/lib/location.ts`
- `src/nws.ts`
- `src/suncalc.test.ts`

In particular, `GroveMap.tsx` has an uncommitted `maxzoom: 10` fix for RainViewer, and the frontend/backend grove coordinates were updated to `47.4776620, -121.7300978`. Do not discard or overwrite these edits.

## What exists today

### Placement and product behavior

- Mapbox is used only on the Grove/Overview route. `frontend/src/screens/Grove.tsx:29-34` renders `SpatialEvidencePanel` beside the priority insight.
- The entire map is conditional on `needsAttention > 0 && priorityTree`. That state comes from mock/demo tree insights in `frontend/src/hooks/useGroveOverview.ts`, not purely from live environmental conditions. The map can therefore disappear when it would still be useful, or appear because of demo tree state.
- The Environment route does not use the native Mapbox map. At `frontend/src/screens/Environment.tsx:365-372`, it exposes Windy and PurpleAir inside a collapsed iframe section implemented by `frontend/src/components/RegionalMaps.tsx`.
- The current design therefore has two disconnected experiences: a small native map on Overview, and richer but foreign iframe maps on Environment.

### Native Mapbox architecture

The main implementation is `frontend/src/components/spatial/GroveMap.tsx`.

What is sound and should be kept:

- Mapbox GL JS v3 is installed from npm and code-split through `React.lazy` in `SpatialEvidencePanel.tsx:19-22`.
- The map follows React lifecycle correctly and calls `map.remove()` on cleanup (`GroveMap.tsx:68-118`).
- The public Mapbox token is supplied through `VITE_MAPBOX_TOKEN`; the app has a useful missing-token fallback.
- It uses a single grove marker, which is the correct geographic abstraction for five trees on the same deck.
- It supports light/dark Mapbox styles, navigation, fullscreen, attribution, and a themed popup.
- It is honest about data granularity: local wind and AQI are rendered as point-based indications instead of invented regional contours.
- It respects `prefers-reduced-motion` for the local wind animation.
- Layer-specific facts and source/freshness text appear below the map.

What the four current layer buttons actually do:

1. **Grove impact**: base map plus the grove marker and a local wind arrow. The meaningful explanation is mostly in rows below the map.
2. **Wind exposure**: seven animated GeoJSON dots traveling a very short distance from the grove, based on the local sensor's wind direction and speed. This is a point glyph, not a regional wind field.
3. **Air & smoke**: a 42-pixel colored ring based on local AQI, plus textual regional AirNow data below the map. It does not render smoke or regional air quality spatially.
4. **Precipitation**: the latest RainViewer radar tile frame. This is the only genuine regional/gridded overlay.

### Existing data paths

- Local sensor conditions are fetched through `frontend/src/lib/api.ts` and include temperature, humidity, wind, rain, solar radiation, UV index, WBGT, PM2.5, and local AQI.
- The Worker polls Ecowitt every five minutes.
- NWS forecast data is implemented in `src/nws.ts`, requires no key, and is persisted daily.
- AirNow forecast AQI is implemented in `src/airnow.ts`, but requires `AIRNOW_API_KEY`. It currently fetches a regional PM2.5 forecast once daily rather than a nearby spatial observation field.
- Current alerts in GroveIQ are derived from local conditions (`src/alerts.ts`); NWS alert polygons/products are not yet integrated.
- `CHECKLIST.md` says a PurpleAir read key was added as a Worker secret but is not wired into code. `src/env.ts` does not yet declare `PURPLEAIR_API_KEY`, so verify the secret exists before assuming it is available.

## Verified live-site comparison

The authenticated production experience at `https://grove-iq.com` was inspected on 2026-08-17 at desktop size and at a 390x844 mobile viewport.

What production confirms:

- The deployed UI closely matches the reviewed source. The Overview map loads successfully with Mapbox attribution, navigation, fullscreen, all four layer controls, current local readings, AirNow data, and RainViewer metadata.
- The map is appropriately subordinate on desktop. It sits beside the priority signal and does not compete with the tree-care recommendation. Preserve that visual restraint.
- Live data was flowing during verification: the popup and evidence rows updated with temperature, wind, local AQI, regional AirNow AQI, and sensor freshness.
- The grove popup works and fits at desktop size with its current three rows. The implementation is nevertheless tightly constrained by the 260px viewport, so use normal popup anchoring/auto-pan before adding richer content.
- The current Air layer's large translucent circle visibly resembles a geographic influence radius even though it represents one point reading. Replace it with an unmistakable point halo/symbol once nearby air sensors and smoke polygons exist.
- The local wind arrow/particle treatment is barely perceptible at the regional zoom. It is acceptable as a small grove glyph but does not support the label “Wind exposure.”
- RainViewer loaded successfully and exposed a current radar timestamp. Because conditions were clear, production could not visually validate overlay ordering under an opaque storm cell; retain the layer-order fix in the implementation plan.
- The Environment page is rich in local metrics, trends, forecast, and tree implication, but regional maps are near the bottom and hidden behind “Windy & PurpleAir (third-party embeds).” This makes spatial context feel like a separate reference tool instead of supporting the environmental story.
- Expanding the regional maps reveals a cross-origin iframe surface whose internal state cannot participate in GroveIQ's accessibility tree, source/freshness model, units, alerts, or sensor comparisons. This validates replacing it rather than polishing the embed.

Verified mobile defects at 390px:

- The four map pills extend beyond the card and the final control is clipped rather than wrapping or becoming horizontally scrollable.
- Right-aligned evidence values such as wind and affected tree are clipped. The page reports no horizontal overflow, so the content is simply unreachable.
- Map controls sit too close to the right edge; the fullscreen control is partially cramped.
- The surrounding priority card also clips long heading/header/chart content at this breakpoint. That broader responsive defect is outside the map-only scope, but Claude should avoid reproducing the same fixed-width behavior in the replacement panel.

Before closing implementation work, repeat the authenticated production check in light and dark mode, with a non-empty radar frame if possible, and confirm the deployed commit, provider failures, attribution, fullscreen, and keyboard behavior.

## Product assessment

The current direction is good: Mapbox is already subordinate to a priority insight and uses a restrained base map. The problem is not lack of visual effects. The problem is that the app's best regional context lives in iframes, while the native map mostly restates point readings already shown elsewhere.

The most important change is to make one native environmental-context map a permanent part of Environment, then let Overview show a compact, automatically selected view only when a regional condition explains an active grove risk.

## Keep, change, add, defer

### Keep

- One grove marker; do not add five overlapping geographic markers.
- Mapbox GL JS v3, npm integration, lazy loading, cleanup, attribution, and fullscreen.
- The current North Bend center and approximately regional zoom (`10.5`) as a starting camera.
- Muted light/dark basemaps and the local popup.
- The principle that point data stays point data.
- Source names and timestamps visible in the UI.
- Reduced-motion behavior.

### Change now

- Render the native map permanently on the Environment screen. Keep Overview's version compact and conditional on a genuinely relevant environmental driver, not merely `needsAttention` from demo tree data.
- Remove `RegionalMaps.tsx` and its Windy/PurpleAir iframe UI after equivalent native layers are available. Do not leave iframe fallback paths in the normal product UI.
- Rename the current **Air & smoke** button to **Local air** until smoke is actually rendered. Rename **Wind exposure** to **Wind at grove** until a regional velocity field exists.
- Replace the flat set of tiny pills with four operational modes: **Situation**, **Storms**, **Air & fire**, and **Heat & sun**. Put optional sublayers inside the selected mode rather than presenting ten equal top-level buttons.
- Make layer controls at least 44 pixels high on touch devices. The existing `4px 9px` pill padding and non-wrapping inner tablist are too small and can overflow on narrow screens.
- Increase the ordinary map viewport to roughly 300-340px on desktop and 280-320px on mobile. The current three-row popup fits on desktop, but its content budget is dictated by the shallow viewport; use Mapbox anchoring/auto-pan before adding more rows.
- Replace `setHTML(popupHtml)` with DOM construction or a React-controlled popup. The current values are numeric/trusted, but raw HTML is an unnecessary boundary and makes future tree/context content risky.
- Do not put `role="img"` on the interactive map container. It can hide interactive descendants from assistive technology. Use a labelled region/group and give the grove marker keyboard semantics (`button`, `tabIndex=0`, Enter/Space behavior).
- Either implement complete tab semantics (tabpanels and keyboard arrow navigation) or use ordinary pressed buttons. Do not combine `role="tab"`, `aria-selected`, and `aria-pressed` without a tabpanel.
- Insert raster/fill overlays beneath basemap labels. `map.addLayer()` without a `beforeId` currently puts radar above all style layers, which can wash out place and road labels. For the current Light/Dark v11 styles, find the first symbol layer and insert before it; if moving to Mapbox Standard, use an appropriate layer slot.
- Give every provider a real loading, empty, stale, and error state. The current radar UI can remain stuck on `Loading…` when the manifest returns no frames and logs map errors only to the console.
- Give each row its own timestamp. The Air mode currently displays local-sensor freshness beside a regional AirNow value that has a different cadence.

### Add in the first implementation phase

#### 1. Native storms mode

- Keep the working RainViewer adapter temporarily, but isolate it behind a provider interface and verify its production-use terms. Add manifest response checks, schema validation, abort handling, a cached manifest, and a useful empty state.
- Add radar animation with a play/pause button, latest-frame button, frame timestamp, and a small time slider. Default to the latest frame and respect reduced motion by not auto-playing.
- Add active NWS alerts from `api.weather.gov` through the Worker. Render alert polygons where geometry exists; otherwise indicate that an alert applies to the grove without inventing a polygon. Include event, severity, effective/expires time, and a direct NWS detail link.
- Add current/forecast precipitation context below the map: local gauge total, NWS precipitation probability, radar time, and a concise action statement such as "rain approaching; delay irrigation check." Do not equate radar reflectivity with water reaching a covered pot.
- Evaluate NOAA MRMS WMS as the authoritative long-term radar source. NOAA publishes composite radar through public OGC services; Mapbox can consume WMS tiles as a raster source. Keep the provider adapter so RainViewer and MRMS can be switched without rewriting the UI.

#### 2. Native air, smoke, and fire mode

- Wire the PurpleAir read key only in the Worker. Add a bounded nearby-sensors endpoint that returns a small, normalized GeoJSON collection around the grove; never expose the provider key to the browser.
- Render nearby air sensors as individually clickable circles. Label them clearly as community sensors and distinguish them from GroveIQ's local sensor and AirNow's regional forecast.
- Do not create an interpolated AQI heatmap from a sparse handful of sensors. Use points until density and methodology justify a surface.
- Add NOAA HMS smoke polygons through a Worker ingestion/normalization step. Style light/medium/heavy density with both color and pattern/outline distinctions, and display observation time. Treat these as observed plume extents, not ground-level concentration forecasts.
- Add NASA FIRMS near-real-time active fire detections for a bounded regional box. Convert provider results to GeoJSON in the Worker, cluster at lower zooms, and show acquisition time, confidence, satellite, fire radiative power when available, and distance/bearing from the grove. Explain that detections are hotspots, not fire perimeters.
- Keep AirNow's regional forecast/discussion as text evidence under the map. Correct the current configuration gap and use its own stored timestamp.

#### 3. Situation mode and GroveIQ correlation

- Make **Situation** the default. Select the most relevant environmental layer automatically using a transparent priority order, for example: active severe NWS alert; nearby fire/smoke or elevated AQI; approaching precipitation; heat/UV; otherwise calm overview.
- Preserve manual selection for the session. Never keep snapping the user back to the automatic layer while they are exploring.
- Under the map, show a compact evidence strip rather than a generic weather readout. Examples:
  - "Radar 18 min old · local rain today 0.00 in · NWS precipitation chance 70%."
  - "Deck AQI 82 · nearby corrected sensor median 76 · regional AirNow forecast Moderate."
  - "Fire detection 34 mi NE · wind at grove from NE · smoke plume does/does not intersect grove."
- Treat these as contextual comparisons until enough synchronized history exists for actual statistical correlation. Do not use the word "correlated" solely because two current values are both elevated.
- Add a normalized backend snapshot table only when building time-based correlation. Store provider, metric, value/category, source timestamp, fetched timestamp, and spatial scope. Then align those snapshots with `conditions_readings` and annotate 24h/72h charts with alert, plume, fire, or radar events.
- Keep the distinction between real shared environmental data and demo per-tree readings prominent. Do not imply a specific tree response is measured until tree sensors are installed.

### Add in the second phase

- Heat/temperature field, regional humidity, UV, and regional wind field from one licensed gridded-weather provider, selected after a cost/terms/coverage spike.
- A true Mapbox `raster-particle` wind layer only when GroveIQ has a production velocity tileset. Mapbox supports raster-array/raster-particle rendering, but its public GFS example tileset is an example, not a provider contract for GroveIQ.
- Time-synchronized map and sensor-history scrubber once provider snapshots have accumulated.
- Optional precipitation accumulation layer if a trustworthy source and clear irrigation interpretation are available.

### Defer

- Five individual tree markers on the regional map. They share one deck location and will overlap. If precise placement becomes useful, build a separate deck plan, not a geographic map.
- Search/geocoding and user-location controls. This app has one fixed grove.
- 3D terrain, satellite basemap, decorative flyovers, and generic POI browsing.
- A heatmap generated from GroveIQ's single sensor.
- Lightning unless it directly changes a defined action or hardware-protection workflow and a suitable licensed feed is chosen.
- Snow beyond the existing frost/freeze operational need.

## Recommended component and data architecture

Do not keep adding provider fetches and layer effects to one `GroveMap.tsx` file. The component already owns map lifecycle, markers, local wind animation, AQI ring, radar fetches, source metadata, theme changes, and popup updates.

Suggested frontend structure:

```text
frontend/src/components/environment-map/
  EnvironmentalContextPanel.tsx     # layout, mode controls, evidence strip
  EnvironmentalMap.tsx              # Mapbox lifecycle only
  GroveMarker.ts                     # accessible marker/popup DOM
  layerCatalog.ts                    # IDs, labels, legends, ordering
  layers/
    radarLayer.ts
    nwsAlertsLayer.ts
    airSensorsLayer.ts
    smokeLayer.ts
    fireLayer.ts
    localConditionsLayer.ts
  useEnvironmentalContext.ts         # fetch/state/refresh/provider metadata
```

Suggested Worker structure:

```text
src/environment/
  nwsAlerts.ts
  purpleAir.ts
  nasaFirms.ts
  noaaHmsSmoke.ts
  types.ts
src/routes/environmentContext.ts
```

Return normalized payloads with `source`, `sourceUpdatedAt`, `fetchedAt`, `scope`, `status`, and GeoJSON/data. Cache provider calls at appropriate cadences. Keep all secret-bearing calls server-side. Bound all spatial queries around the grove and return only fields the UI uses.

Use stable Mapbox source/layer IDs and update existing sources with `setData`, `setTiles`, paint/layout changes, and filters where possible. Avoid repeatedly destroying and recreating the map. Re-add custom sources/layers after a base-style change through one centralized style-load handler.

## API keys and registrations

### Needed or must be confirmed now

1. **Mapbox public token — already in use**  
   Confirm `VITE_MAPBOX_TOKEN` exists in production and restrict it to `https://grove-iq.com/*` plus explicit localhost development URLs. A browser Mapbox token is intentionally public; URL restrictions and minimal scopes are the controls.

2. **AirNow API key — registration needed unless already completed**  
   `src/airnow.ts` is ready, but the repository checklist still says the key is not configured. Register for the AirNow API and set `AIRNOW_API_KEY` as a Cloudflare Worker secret. Do not put it in the Vite frontend.  
   Official information: <https://docs.airnowapi.org/about>

3. **PurpleAir read key — verify existing secret**  
   `CHECKLIST.md` says `PURPLEAIR_API_KEY` was added, but no code or `Env` declaration uses it. Confirm the Cloudflare secret exists, then add it to `src/env.ts` and wire only a server-side read flow. No write key is needed.  
   Key dashboard: <https://develop.purpleair.com/dashboards/keys>

4. **NASA FIRMS MAP_KEY — obtained; configuration still needed**  
   The user supplied a FIRMS MAP_KEY during this review. Do not copy it into this document, source code, `.env` files committed to Git, frontend variables, logs, screenshots, or task output. Because it was pasted into a chat, recommend rotating it before production. Store the final value only as a Cloudflare Worker secret named `NASA_FIRMS_MAP_KEY`. Query only a bounded North Bend/PNW box and cache results.  
   Official instructions: <https://firms.modaps.eosdis.nasa.gov/api/map_key> and <https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html>

### No key required for the first phase

- NWS forecasts and active alerts: <https://www.weather.gov/documentation/services-web-api>
- NOAA public GIS/WMS radar products: <https://opengeo.ncep.noaa.gov/geoserver/www/index.html>
- NOAA HMS smoke shapefiles: <https://www.ospo.noaa.gov/products/land/hms.html>
- Current RainViewer public manifest/tile use is keyless, but verify terms and keep it replaceable rather than making it a hard architectural dependency.

### Optional later provider decision

Regional wind, temperature, humidity, UV, and heat surfaces require a genuine licensed gridded dataset or a data-processing pipeline. Do not register for multiple weather vendors yet. First build and ship the keyless NOAA/NWS layers plus the already-planned AirNow, PurpleAir, and FIRMS integrations. Then run a short provider spike comparing coverage, update frequency, tile/vector formats, browser redistribution rights, cost, and Cloudflare compatibility.

## Concrete file changes

1. `frontend/src/screens/Environment.tsx`
   - Replace the collapsed `RegionalMaps` iframe block with the permanent native environmental-context panel.

2. `frontend/src/components/RegionalMaps.tsx`
   - Remove after native storms and air/fire modes reach parity. Remove its imports/usages in the same change.

3. `frontend/src/screens/Grove.tsx`
   - Decouple the compact context map from demo-only `needsAttention`, or render it only when an environmental driver is truly relevant.

4. `frontend/src/components/spatial/SpatialEvidencePanel.tsx`
   - Evolve or replace with `EnvironmentalContextPanel`; fix control semantics/touch sizing and move popup creation out of raw HTML strings.

5. `frontend/src/components/spatial/GroveMap.tsx`
   - Preserve the existing uncommitted RainViewer max-zoom fix.
   - Split map lifecycle from providers/layers.
   - Fix layer ordering, accessibility, error states, timestamps, aborts, and radar animation.

6. `frontend/src/lib/api.ts`
   - Add normalized environment-context API types and fetch functions.

7. `src/env.ts`
   - Add optional `PURPLEAIR_API_KEY` and `NASA_FIRMS_MAP_KEY` fields after secrets are confirmed/created.

8. `src/index.ts` and new environment route/provider modules
   - Add read-only endpoints for active alerts, nearby air sensors, smoke polygons, and active fire detections.

9. `wrangler.toml`
   - Add appropriate scheduled refreshes only where needed. Do not fetch all providers every five minutes by default; use source-appropriate cadence and cache headers.

10. Database migrations
    - Add a normalized historical snapshot table only when implementing time-based comparison/correlation, not merely to render current layers.

## Testing and acceptance criteria

- No `iframe` remains in the environmental map experience.
- One native map appears on Environment even when all trees are healthy.
- Overview never presents a demo tree signal as though it were measured environmental correlation.
- Storms mode renders a regional radar layer below labels, shows source time, animates frames, can be paused, and fails gracefully.
- Active NWS alerts that apply to the grove are visible and readable even when geometry is unavailable.
- Air & fire mode distinguishes GroveIQ local data, community sensors, AirNow regional forecast, observed smoke plume, and satellite fire detections.
- Every layer shows source and source timestamp; stale and unavailable states are explicit.
- Secret provider keys never appear in frontend bundles or network requests from the browser.
- The grove marker and mode controls are keyboard accessible; map controls remain exposed to assistive technology.
- Touch targets meet 44x44px guidance and controls work at narrow mobile widths without accidental horizontal page overflow.
- Reduced-motion users do not receive autoplay radar or wind animation.
- Provider attribution remains visible in normal and fullscreen views.
- Tests cover provider normalization, empty/malformed responses, data freshness, layer selection priority, and key UI states. Add a small map-layer integration test using a mocked Mapbox object; do not depend on live provider calls in unit tests.
- Verify a production build, lint, tests, and the authenticated deployed site in both light and dark modes.

## Suggested delivery sequence

1. Refactor the map shell and make it permanently available on Environment; keep behavior otherwise equivalent.
2. Fix accessibility, mobile controls, source metadata, error states, and overlay ordering.
3. Add NWS alerts and animated radar natively.
4. Wire PurpleAir nearby sensor points and AirNow timestamp/configuration.
5. Add FIRMS detections and NOAA HMS smoke polygons.
6. Remove the iframe components.
7. Add the Situation mode and contextual evidence strip.
8. Accumulate normalized history before introducing claims of correlation.
9. Evaluate one licensed gridded provider for regional wind/temperature/humidity/UV, then implement only the layers that materially change tree-care decisions.

The correct end state is one restrained Mapbox canvas that brings GroveIQ's local measurements, regional evidence, alerts, and tree-care implications together. The map should explain the situation in a few seconds and then get out of the way.
