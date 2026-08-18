# GroveIQ Build Checklist

Tracks progress against `SPEC.md`'s phasing (section 6). Update this
alongside real changes — it's a snapshot, not a source of truth; the code
and `SPEC.md` are authoritative when they disagree with this file.

Last updated: 2026-08-18 (WH51 soil sensors physically installed and writing real per-tree data — Phase 1's blocker is resolved).

## Soil sensors installed, real data flowing (2026-08-18)

**Phase 1's blocker is resolved**: 5 WH51 soil sensors are physically installed, one per tree, and confirmed reporting real data through Ecowitt. Two real bugs found and fixed while wiring this up (both previously invisible since there was no real hardware to check the guesses against):

- **`src/ecowitt.ts` soil-channel parsing was looking for the wrong field.** It read `data.soil_ch{n}`, a guess made before any sensor existed to verify against; the real Ecowitt field is `soil_moisture_ec_ch{n}`. This meant `soilChannels` silently returned `[]` forever — not a crash, just quietly empty, which is exactly the kind of failure that's easy to miss. Fixed, and extended `EcowittSoilChannel` to capture `soilTempC`/`soilEc` (previously only `soilMoisturePct`), matching all three real columns `soil_readings` already had.
- **EC unit mismatch.** Ecowitt reports EC in µS/cm (its own payload labels it `"unit": "μS/cm"`); every existing EC value in this codebase — `ec_threshold_high` (2.2-2.5), mock data's generated range (~0.4-2.0), Tree Detail's chart label — is mS/cm. Without converting, every real reading (e.g. 140 µS/cm) would've been written as "140 mS/cm," 1000x past any threshold. Now divided by 1000 in `ecowitt.ts`. Caught two already-written rows with the raw (wrong) value from the brief window between deploying the real channel mapping and finding this bug — corrected via a direct `UPDATE` rather than left in the table.
- **`src/soilChannels.ts`** (new) maps each physical channel (1-5) to a `tree_id` — there's no way to derive this from the API, the gateway just reports "channel 3," not which pot it's in. Confirmed against the real install by the user: `1=mountain-hemlock, 2=dawn-redwood, 3=yellow-cedar-1, 4=yellow-cedar-2, 5=silver-fir`. `writeSoilReadings()` silently skips any channel without a confirmed mapping (fail-safe default was all-`REPLACE_ME` placeholders until the user gave the real assignment) — a wrong per-tree mapping would silently mislabel one tree's health data as another's, worse than no data.
- Wired into the existing `*/5 * * * *` cron (`src/index.ts`) alongside the conditions poll — real `soil_readings` rows are now landing in D1 every 5 minutes.
- New route `GET /api/v1/trees/:id/soil-readings?hours=N` (`src/routes/trees.ts`, defaults to 720h/30 days) — nothing consumes it yet.
- Updated the AI-diagnostic guardrail comment in `src/claude.ts`: the original condition ("don't build a diagnostic until sensors are real") is now satisfied backend-side, but the comment now also flags that the **frontend still renders 100% synthetic data** (`frontend/src/data/mockData.ts`'s `dailyReadingsFor()`/`analyzeTree()`/`insightFor()` — Trees, Tree Detail, Timeline, Grove all still use these, untouched by this pass) — building a real diagnostic now, without also moving the UI off mock data, would put a real AI verdict next to a fake chart that visually contradicts it. Explicitly flagged as a bigger, separate lift, not done in this pass.
- **Not yet examined closely, but real and worth a look**: initial readings show several trees well below their seeded moisture threshold (mountain-hemlock 19% vs. threshold-low 35%, dawn-redwood 11% vs. 32%, silver-fir 8% vs. 33%) — could be genuine dryness, could be sensor settling after fresh installation. Not enough data history yet to tell which.

**Not done in this pass** (the natural next step, substantial enough to be its own piece of work): wiring Trees/TreeDetail/Timeline/Grove off `mockData.ts` and onto real `soil_readings` + the new route above; building the actual daily per-tree diagnostic function in `src/claude.ts` (guardrail is now clear to proceed, function itself doesn't exist); seeding real, researched thresholds in place of the current species-level rough guesses now that live data exists to sanity-check them against.

## Environmental context map refactor (2026-08-17)

The user provided a detailed implementation brief ("GroveIQ-Mapbox-Implementation-Brief-for-Claude.md") reviewing the Mapbox integration and proposing a 9-step delivery sequence (native NWS alerts/radar animation, PurpleAir sensors, NOAA HMS smoke, NASA FIRMS fire detections, a Situation/Storms/Air&Fire/Heat&Sun mode restructure, then removing the Windy/PurpleAir iframes). Given the scope, only steps 1-2 were done in this pass; steps 3+ are tracked as separate follow-up tasks.

**Also secured immediately on receipt**: the brief included a NASA FIRMS API key pasted in plaintext chat — stored as `NASA_FIRMS_MAP_KEY` Worker secret before anything else, never written to a file. Same posture as the PurpleAir key from earlier this session and the camera-key incident from 2026-08-15 — flagged to the user that pasted-in-chat keys should be rotated before production use.

**Step 1 — shell refactor**: `frontend/src/components/spatial/GroveMap.tsx` and `SpatialEvidencePanel.tsx` (one file each owning map lifecycle, layer logic, and panel UI) replaced with `frontend/src/components/environment-map/`:
- `EnvironmentalMap.tsx` — Mapbox lifecycle only (init, style/theme changes, cleanup).
- `GroveMarker.ts` — accessible marker + popup construction.
- `layerCatalog.ts` — layer IDs/labels.
- `layers/radarLayer.ts`, `layers/localConditionsLayer.ts` — provider/domain logic (RainViewer fetch+status; wind particle math, AQI ring, color mapping), separated from React lifecycle so they're independently testable and swappable (e.g. RainViewer → NOAA MRMS later without touching the map shell).
- `EnvironmentalContextPanel.tsx` — layout, layer buttons, evidence rows. Replaces `SpatialEvidencePanel` and is **purely environmental** — no per-tree insight/driver props. The old panel's "impact" layer showed tree-driver correlation text sourced from demo mock data next to real live-data rows; the brief's acceptance criteria explicitly calls this out ("never present a demo tree signal as though it were measured environmental correlation"), so that content was dropped rather than carried forward. Tree-specific priority framing stays in `PriorityIntelligencePanel`, unchanged.
- The map now renders **permanently on Environment.tsx** (previously it only existed on Overview). The Windy/PurpleAir iframe section (`RegionalMaps.tsx`) is kept for now — brief step 6 explicitly sequences its removal *after* native Storms/Air&Fire reach parity, which hasn't happened yet.
- On Overview (`Grove.tsx`), the compact map is now **decoupled from `needsAttention`** (demo tree status) and always renders; previously the entire map disappeared whenever all 5 trees were healthy. The tree-specific `PriorityIntelligencePanel` next to it stays conditional, since that one legitimately is about a specific tree.
- Two of the brief's layer renames applied now (cost nothing, honest about current content): "Air & smoke" → "Local air", "Wind exposure" → "Wind at grove". The full Situation/Storms/Air&Fire/Heat&Sun mode restructure was **not** done — three of those four modes have zero real content until steps 3-5 ship (NWS alerts, PurpleAir, FIRMS/smoke don't exist yet), and Heat&Sun has no defined content anywhere in the brief. Shipping empty mode buttons now would be exactly the half-finished-scaffolding pattern this project avoids elsewhere.

**Step 2 — accessibility/touch-target/ordering fixes** (folded into the same pass, same files):
- `role="img"` on the map container (hides interactive descendants from assistive tech) → `role="region"`.
- Grove marker is now a real `<button>` (keyboard-focusable, native Enter/Space activation) instead of a bare `<div>`.
- Popup content built via `setDOMContent`/real DOM nodes instead of `setHTML(rawHtmlString)`.
- Removed the broken `role="tab"` + `aria-selected` + `aria-pressed` combination (brief: implement full tab semantics with a tabpanel, or use ordinary pressed buttons — chose the latter, simpler and no tabpanel needed for 4 independent layer views). Now `role="group"` + plain buttons with `aria-pressed`.
- Layer pills: `minHeight: 44` (was ~24px effective height) and `flexWrap: 'wrap'` — fixes the verified mobile defect where pills overflowed the card and the last one clipped instead of wrapping. Verified at 390px.
- Evidence rows (`Row` component): `flexWrap` + `minWidth: 0` + `wordBreak: 'break-word'` on the value span — fixes the verified mobile defect where right-aligned values (e.g. long wind/AQI strings) were clipped and unreachable (page reported no horizontal overflow, so it was a flex-shrink issue, not a scroll issue).
- Radar raster layer now inserted with `beforeId` (first symbol layer in the current style) instead of a bare `addLayer()`, which was stacking it above all labels — place/road names would've washed out under an opaque storm cell (only reproducible with rain in the area, not verified live for that specific case, but the ordering fix itself is unconditional).
- Radar now reports explicit `loading`/`ready`/`empty`/`error` states (was: `useState` seeded at `Loading…` with no path to ever show anything else if the manifest came back empty, and errors only went to `console.error`).
- "Local air" layer now shows separate freshness for the local sensor vs. the regional AirNow value (previously shared one `Freshness` row despite the two updating on completely different cadences — 5-min poll vs. daily).
- `PURPLEAIR_API_KEY` and `NASA_FIRMS_MAP_KEY` added to `src/env.ts` (values already stored as Worker secrets; declaring them here doesn't wire any fetch logic yet, that's steps 4-5).

**Verified**: typecheck (frontend `tsc -b` + backend `tsc --noEmit`) clean, full backend test suite (35 tests) still passing, browser-verified in local dev — layer switching, popup (DOM-based, no HTML injection), RainViewer maxzoom fix survived the refactor, accessibility tree confirms `region`/real `button` elements, 390px mobile pill-wrapping and evidence-row-wrapping both fixed, dark mode. **Not verified**: the authenticated production site (`grove-iq.com`, behind Cloudflare Access) — no browser session available for that login in this environment; local dev exercises the identical built code against demo/no-live-data fallback states instead of live provider data, which is a meaningfully different verification than what the brief asked for ("repeat the authenticated production check"). Recommend the user do a manual pass on the live site, light and dark mode, ideally during actual rain for the radar-under-labels ordering fix.

**Deliberately not done in this pass** (tracked as follow-up tasks, matching the brief's own step numbering):
- Step 3: native NWS alerts, animated radar with play/pause/timestamp slider.
- Step 4: real PurpleAir nearby-sensor markers (key is stored and declared, no fetch/route/rendering yet), AirNow config/timestamp fix.
- Step 5: NASA FIRMS fire detections, NOAA HMS smoke polygons.
- Step 6: removing `RegionalMaps.tsx` (blocked on step 3-5 reaching parity, per the brief).
- Step 7: Situation mode with auto-selected layer priority + evidence strip; the full 4-mode button restructure.
- Steps 8-9: normalized historical snapshot table for real correlation claims; licensed gridded-weather provider evaluation. Both explicitly deferred in the brief itself, not just by this pass.

## Mapbox GroveMap enhancements (2026-08-17)

Prompted by "where can we make it better?" — audited the existing native
map integration (Overview's Spatial Evidence panel only; nowhere else in
the app uses Mapbox) and shipped what was actually feasible for free:

- **Dark mode fix** — `GroveMap.tsx` was hardcoded to `light-v11`
  regardless of theme. Now picks `light-v11`/`dark-v11` on mount and
  live-switches via a `matchMedia` listener, matching how the rest of the
  app already follows `prefers-color-scheme` with no manual toggle.
- **Click popup on the grove marker** — shows live temp/wind/AQI at a
  glance without switching layers. Content built in `SpatialEvidencePanel`
  (unit-system-aware formatting already lives there) and passed down as
  HTML; `GroveMap` stays presentation-only. Custom `.mapboxgl-popup-*` CSS
  added to `theme.css` so it inherits the app's palette instead of
  Mapbox's default white box. **Real bug found and fixed**: a 4th
  "freshness" row caused the popup to clip against the map card's
  rounded-corner `overflow: hidden` edge, since the grove marker is always
  exactly vertically centered (fixed map `center`) with only ~height/2 of
  room below it — dropped to exactly temp/wind/AQI as scoped, which fits.
- **Fullscreen control** — one line (`FullscreenControl`), verified present
  via the accessibility tree (actual fullscreen transition doesn't fire
  under browser-automation testing, expected and unrelated to app code).
- **Animated wind particle stream** — replaces the static ring for "Wind
  exposure" specifically (Air & smoke keeps its ring; wind gets particles
  instead). Small dots animate outward from the grove marker along live
  wind direction, via `requestAnimationFrame` + a GeoJSON source
  `setData()` each frame, fading as they travel. Deliberately stays
  anchored to the grove's single point reading rather than a fabricated
  regional flow field (same "critical data limitation" principle as the
  ring it replaces) — distance scales loosely with wind speed for visual
  distinction, not real-world scale. Respects `prefers-reduced-motion`
  (renders fixed, non-animated particle positions instead). Verified live
  with temporarily-forced wind values in local dev (no live conditions
  data available locally due to the documented cross-origin Access
  limitation).
- **PurpleAir API key added** (`PURPLEAIR_API_KEY` Worker secret, read-key
  only, `develop.purpleair.com`) — **not yet wired into any code.** Plan:
  real nearby-sensor markers on the native map, replacing/supplementing
  the "Air & smoke" ring, once actually implemented. Windy stays an
  iframe regardless (`RegionalMaps.tsx`) — no free keyless alternative
  exists for gridded wind model data.

## ESP32 camera-capture firmware + security incident (2026-08-14)

Architecture decision made explicitly by the user: the camera-capture relay
runs on the **same** ESP32-S3 board as irrigation (not a second device),
isolated onto its own FreeRTOS task pinned to core 0 so a slow Reolink/
network call can never delay the irrigation safety loop on core 1 (see
`firmware/irrigation/README.md`'s "Camera capture task" section for the
full design). New: `include/camera_task.h`, `src/camera_task.cpp`,
`include/tree_presets.h` (tree→PTZ-preset table); `main.cpp` now starts the
task from `setup()` and its own `httpGetJson`/`httpPostJson` were fixed to
use `WiFiClientSecure` (a real, previously-undiscovered TLS-handling bug —
this firmware had never been flashed, so it was never caught).

Call shapes (Reolink login/PTZ/snapshot, Worker upload/fail) match a
standalone bench-test sketch the user ran successfully against real
hardware (200 response, full pipeline verified end-to-end).

**Update 2026-08-15: production firmware verified live on real hardware.**
Flashed via the Arduino IDE build path (below) — WiFi connect → Reolink
login → PTZ move to preset → snapshot → upload → Worker → vision analysis,
full round trip over the "Capture now" in-app request, `HTTP 200`,
`analysis_id` returned. Two real bugs found and fixed during bring-up:
- `camera_task.cpp` was missing `#include <WiFi.h>` (used `WiFiClient`/
  `WiFi.status()`/`WL_CONNECTED` directly but only included
  `WiFiClientSecure.h`, which doesn't transitively pull in the full header
  on the current esp32 Arduino core) — compile-time failure, first real
  feedback this firmware had ever gotten.
- `src/claude.ts`'s vision analysis (`analyzeTreePhoto()`) had
  `max_tokens: 500`, too tight for the JSON response shape — the model's
  `detail` field got cut off mid-sentence, producing invalid JSON and a
  502 on the capture endpoint. Raised to 1024, and the JSON-parse-failure
  error now reports when `stop_reason` was `max_tokens` so a future
  regression is diagnosable from the error message alone.
- Also added boot/WiFi-connect/60s-heartbeat `Serial.println` logging to
  `main.cpp` — the irrigation loop previously had zero output on the happy
  path, which looked identical to a hang during bring-up.

**Root cause found and fixed**: two consecutive live captures of
`silver-fir` came back "no clear view of the tree" from the vision model
(one explicitly described a deck/planter, not foliage). Diagnosed by
issuing the exact same Reolink login → `PtzCtrl` `ToPos` sequence directly
via curl from a Mac, bypassing the ESP32 entirely: requesting `id: 1`
(matching the app's displayed "preset 1") produced zero physical camera
movement, while `id: 0` did move it. **Reolink's CGI API preset `id` is
0-indexed**, while the app's UI shows presets as 1-based slots — `id: 1`
was silently accepted as a valid-but-different (or nonexistent-but-still
"successful") request, explaining why the API kept reporting `code: 0`
success on every attempt despite pointing at the wrong thing the whole
time. Fixed in `tree_presets.h` (all 5 values shifted down by one:
`silver-fir` is now `0`, ..., `mountain-hemlock` is `4`) and mirrored in
`scripts/camera-capture/config.example.json`'s `treePresets` for the Mac
script, with a warning comment/README note in both places for whoever
sets up the remaining 4 presets next. Also bumped `kSettleMs`
2500ms→5000ms and added logging of the exact requested preset ID and the
camera's full PTZ response — both were useful for this diagnosis and stay
useful for the next one.

**Security incident during this work, fixed same session**: a bench-test
sketch was briefly committed to the (public) `kyle24ryan/groveiq` repo
containing a real `CAMERA_DEVICE_KEY` value instead of a placeholder.
Fixed: rotated `CAMERA_DEVICE_KEY` via `wrangler secret put`, removed the
real file from git tracking (kept on disk, gitignored), replaced it with a
proper `.example` template, and confirmed via repo-wide grep that no other
tracked file held the old value. The Cloudflare Access Service Token
secret (typed only in chat, never committed) is lower-priority to rotate —
the user's call whether to.

Also switched the device-facing capture endpoints from a Cloudflare Access
"Bypass" policy (would've left them open at the edge, gated only by the
Worker's own key check) to an **Access Service Token**, on explicit user
request ("I dont want an open endpoint").

**Arduino IDE build path added** (same day): since no PlatformIO toolchain
was available to even compile-check the firmware, added
`firmware/irrigation/arduino_sketch/` — a generated, flattened copy of
`src/`+`include/` in the single-folder layout Arduino IDE requires (main
file renamed `.ino`, no subfolders). PlatformIO's `src/main.cpp` +
`include/*.h` remains the source of truth; the Arduino copy is regenerated
by hand (steps in `arduino_sketch/README.md`) when the source changes.
Full board-settings walkthrough included there — notably the N16R8 module
needs **Flash Size 16MB** + **PSRAM: OPI PSRAM** set explicitly in Arduino
IDE's Tools menu (PlatformIO's board definition sets these automatically),
or `ps_malloc()` in the camera task's snapshot buffer silently fails.

## Push notifications

Item 1 of the original UI/UX backlog, unblocked (unlike Twilio/Mapbox this
needed no external account -- VAPID is a self-generated key pair):

- Backend: migration `0012_push_notifications.sql` (`push_subscriptions`
  table), `src/push.ts` (`sendPushToAll`, via `webpush-webcrypto` --
  pure Web Crypto API, unlike the Node-only `web-push` package, so it runs
  in Workers; the package ships no TS types, covered by a minimal ambient
  declaration at `src/types/webpush-webcrypto.d.ts`), `src/routes/push.ts`
  (vapid-public-key/subscribe/unsubscribe/test endpoints). VAPID keys
  generated once locally and stored as Worker secrets
  (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`), not committed anywhere.
- Wired into `alerts.ts`'s `deliverAlert()`: push fires at both watch and
  urgent tiers (alongside email) since there's no compliance/consent gate
  like SMS -- the browser permission prompt already is the opt-in.
- Frontend: `public/sw.js` (minimal service worker, just push +
  notificationclick), `components/PushNotificationsCard.tsx` (enable/
  disable/test-send UI, standalone from the SMS consent flow), wired into
  `NotificationSettings.tsx` and reflected in Settings.tsx's summary row.
- Verified: subscribe/unsubscribe DB round-trip via curl, service worker
  registers and the UI correctly shows the "blocked" state when
  `Notification.permission` is denied (as it is in this sandboxed test
  browser). **Not verified**: actual push delivery end-to-end, which needs
  a real granted-permission browser session -- ask the user to visit
  Settings → Notification Settings and click "Enable push notifications",
  then "Send test notification" to confirm.

## Error-message audit (found while verifying push notifications)

Swept the frontend for the same `TypeError: Failed to fetch`-leaking
pattern already fixed once in Environment.tsx this session (spec 13's
named anti-pattern) and found four more instances: `Settings.tsx`'s
ProfileCard (both load and save), `NotificationSettings.tsx`'s initial
load, `TreeDetail.tsx`'s profile-save and photo-upload handlers, and one
in the push notifications code I'd just written myself
(`PushNotificationsCard.tsx`, all three handlers). All now show static,
friendly messages instead of the raw thrown error.

## Command + Spatial Intelligence redesign

Full spec: `docs/GROVEIQ_COMMAND_SPATIAL_REDESIGN_SPEC.md`. User approved
building the whole spec, phased, confirming scope at each phase rather than
upfront. Status:

- [x] Phase 1 — structured `Insight` data model: `detection`/`driver`/
  `confidence`/`evidenceSeries`/`thresholdValue` fields added to `types.ts`,
  populated in `mockData.ts`'s `insightFor()` (deterministic confidence rule
  documented inline). Additive — existing prose fields (`evidence`,
  `comparison`, etc.) unchanged, so TreeCard/Insights/Timeline needed no
  changes.
- [x] Phase 2 — Overview shell: `Grove.tsx` rebuilt around
  `useGroveOverview()` (centralizes fetch + priority ranking so nothing can
  disagree) composing `SituationalHeader`, `PriorityIntelligencePanel` +
  `EvidenceProjectionChart` (observed solid / projected dashed / threshold
  reference line), `GroveConditionStrip` (4 grouped tiles, not a flat metric
  row), `CollectionStatusMatrix` (dense table replacing the old tree-card
  grid on Overview only — Trees.tsx still uses TreeCard, unchanged), and
  `NextRiskPanel`. Route stays `/`; nav label still reads "Grove" (rename is
  Phase 4).
- [x] Phase 3 — native spatial evidence panel, shipped 2026-08-14 once the
  user provided a Mapbox public token. New `components/spatial/GroveMap.tsx`
  (Mapbox GL JS, `light-v11` style, grove marker + wind-direction vector —
  deliberately no invented regional contours per spec's data-limitation
  section, since the repo only has a point location and point-in-time
  readings) and `SpatialEvidencePanel.tsx` ("Why here, why now?": map +
  wind/affected-tree/freshness summary tied to the active priority signal).
  Wired into Overview beside `PriorityIntelligencePanel`. Windy/PurpleAir
  demoted to a collapsed-by-default "Regional source maps" disclosure on
  Environment (via the existing `Collapsible` — iframes don't mount until
  expanded, satisfying spec 18's lazy-load requirement for free).
  **Mapbox GL JS is code-split** (`React.lazy`) since it added ~500KB
  gzipped to the main bundle otherwise (spec 18 explicitly warns about
  this) — confirmed via a real build that the main bundle returned to its
  pre-Mapbox size and the library only loads when the panel renders.
  Token lives in `frontend/.env.local` (gitignored, not committed) as
  `VITE_MAPBOX_TOKEN`; it's a public `pk.` token so embedding it in the
  client bundle is expected/safe, not a leaked secret — recommended the
  user add a URL restriction (grove-iq.com + localhost) on Mapbox's side.
  **Not done**: the fuller Environment→"Spatial" surface rebuild from spec
  section 7 (layer model with Air&smoke/Wind exposure/Frost risk/
  Precipitation each swapping map overlay+interpretation+affected-trees+
  legend+freshness together) — this shipped only the Overview-side spatial
  evidence panel, which was Phase 3's actual scope.
- [x] Phase 4 (partial) — nav labels renamed (Grove→Overview, Insights→
  Intelligence; Insights.tsx's own heading updated to match). Sidebar is
  now a responsive off-canvas drawer below 768px (hamburger top bar,
  backdrop-click-to-close, 44px tap targets) via new `.groveiq-sidebar`/
  `.groveiq-topbar`/`.groveiq-sidebar-backdrop` rules in theme.css;
  unchanged (always-visible 232px) at tablet/desktop widths. **Not done**:
  Environment→Spatial route/rename (deliberately deferred until Phase 3's
  map lands — renaming it now would be premature since the page is still
  weather-only), and full per-screen responsive layout (Environment's
  grids, Overview's matrix-to-cards conversion at narrow widths, etc. —
  content still just squeezes into mobile width rather than reflowing;
  that's Phase 6's responsive QA pass).
- [x] Phase 5 — Insights.tsx rebuilt as the "Intelligence" surface: active
  (non-`ok`) trees each get the same dense `PriorityIntelligencePanel`
  Overview uses (now takes an `eyebrowLabel` prop so a list of them doesn't
  all say "Priority signal"), stable trees collapse to one low-emphasis row
  each. Real same-species comparison workflow shipped: new
  `/trees/compare/:idA/:idB` route (`TreeCompare.tsx`) with side-by-side
  metric cards, an overlaid 14-day moisture chart, and shared species
  context — wired from both the Priority panel's "Compare with X" link and
  a new link on Tree Detail's species card. Analysis model was already
  shared everywhere (`analyzeTree`/`insightFor` used by sidebar, Overview,
  Tree Detail, TreeCard, Intelligence, Timeline) — no changes needed there.
- [x] Phase 6 (scoped) — no formal test suite exists in this repo and one
  wasn't introduced (flagging rather than adding testing infra unprompted).
  Did a manual pass instead, fixing what it found rather than just auditing:
  - Layer-selector buttons (RegionalMaps tabs, Settings' unit/threshold
    toggles) now expose `aria-pressed` (spec 12 explicit requirement — they
    were real `<button>`s already, just missing the state attribute).
  - New charts (`EvidenceProjectionChart`, `TreeCompare`'s overlay chart)
    now carry an `.sr-only` text summary (spec 12: "every chart requires an
    accessible summary") — new `.sr-only` utility added to theme.css.
  - **Real bug found and fixed**: Environment.tsx's error state literally
    rendered `TypeError: Failed to fetch` into the page (spec 13 names this
    exact anti-pattern by example) — worse, the surrounding `{!error &&
    (...)}` hid the *entire* rest of the page behind one failed fetch,
    including RegionalMaps/forecast/Grove-impact sections that don't even
    depend on it. Fixed: generic user-facing error text, and removed the
    blanket conditional so independent sections keep working (most fields
    already degrade to "—" via existing `latest?.field ?? null` fallbacks).
  - Spot-verified light/dark mode, keyboard-reachable controls (all new
    interactive elements are real `<a>`/`<button>`), and confirmed the
    existing global `prefers-reduced-motion` CSS rule covers the new
    sidebar-drawer transition.
  - **Update 2026-08-14**: both "not done" items above are now done, on
    explicit user request (not unprompted this time). WCAG audit computed
    actual contrast ratios (not eyeballed) and found `--ink-faint`/
    `--neutral` genuinely failing (2.4:1 in light mode, below even the
    loosest 3:1 threshold) — fixed in `theme.css`. Full responsive reflow:
    every fixed-column inline grid (17 instances, 8 files) now uses shared
    `.rgrid-2/3/4/sidebar` classes with real breakpoints, verified in
    browser at 402x874 (iPhone 16/17 Pro-class — exact 17 Pro viewport
    unconfirmed), 850px, and 1100px, both color schemes.

## Test suite (2026-08-14)

No test framework existed in this repo; added Vitest to both `frontend/`
and the repo root (backend), on explicit user request. Scoped to genuinely
pure, deterministic functions rather than attempting full component or
Workers-binding (D1/KV) integration tests in one pass:

- `frontend/src/data/mockData.test.ts` — priority ranking, threshold
  crossing, typical-swing gating, confidence derivation, status
  consistency across `analyzeTree`/`insightFor`/`allInsights`, deterministic
  seeding (spec 17's unit-test list, the parts expressible without a DOM).
- `frontend/src/lib/api.test.ts` — `freshnessLabel`'s live/stale
  classification and the 15-minute threshold boundary.
- `src/sms/crypto.test.ts` — phone encryption round-trip, hash
  determinism, E.164 normalization, redaction. Security-sensitive code
  that had no coverage before.
- `src/suncalc.test.ts` — sunrise-before-sunset/day-length invariants,
  seasonal sanity check, and a tolerance-based regression check against
  the astral-verified reference already documented in `suncalc.ts`'s own
  comment (not an exact-string pin, since the algorithm's output shifts by
  the input timestamp's time-of-day, not just the date).

Run with `npm test` in `frontend/` or the repo root.

## Trees and Timeline screens (2026-08-14)

Only Overview and Intelligence got the Command+Spatial redesign treatment;
Trees and Timeline were left as-is. On explicit user request, extended
the app-wide "worst-first" convention (already used by the sidebar and
Overview's matrix) to both:

- `Trees.tsx` previously rendered cards in raw array/insertion order --
  the one screen that disagreed with the rest of the app about which tree
  matters most. Now sorted worst-first, subtitle states the count needing
  attention instead of a static description.
- `Timeline.tsx` previously defaulted to `trees[0]` and listed the tree
  picker in the same raw order. Now defaults to the priority tree and
  sorts the picker worst-first, with a status dot per tree matching the
  sidebar. The scrubbed reading's soil moisture and EC now show an
  in-range/out-of-range delta (matching Tree Detail's pattern) instead of
  bare numbers with no interpretation.

**Not done**: a fuller structural rework of either screen (e.g. porting
Overview's evidence-panel treatment onto Timeline's scrubber) -- these
were intentionally small, low-risk extensions of an existing convention
rather than a second full redesign pass.

**Not done**: React
component/DOM tests (would need `@testing-library/react` + jsdom, a
bigger addition than fit this pass), and Workers-binding integration
tests for D1-touching code (`alerts.ts`'s D1 writes, route handlers) —
those need `@cloudflare/vitest-pool-workers` wired to `wrangler.toml`,
left as a follow-up if deeper coverage is wanted later.

**Known limitation carried from the old Grove.tsx**: tree readings are
still `mockData.ts`'s deterministic demo data, labeled as such in the
header ("Tree readings: demo data"). Live conditions (temp/AQI/forecast)
now feed the condition strip and next-risk panel; per-tree sensor data
still isn't wired to D1/real hardware (soil probes not installed yet).

- [x] Multi-layer weather map (2026-08-14) — `SpatialEvidencePanel`'s map
  now has 4 real, switchable layers (spec 7.3 naming): **Grove impact**
  (default, unchanged), **Wind exposure** (always-on wind vector + a
  colored ring sized by speed severity), **Air & smoke** (colored ring
  from the grove's own local AQI reading — deliberately a point marker,
  not an invented regional contour, since there's no gridded smoke
  dataset here), and **Precipitation** (a genuine gridded overlay: RainViewer's
  public, keyless radar tile API, verified working via a real tile fetch
  before wiring it in). Switching layers updates the map overlay and the
  summary rows together, per spec 7.3's "update all of the following
  together" requirement. AQI categorization thresholds extracted from
  Environment.tsx into `lib/aqi.ts` so the map and the Environment card
  can't disagree. Windy/PurpleAir remain in Environment's secondary
  "Regional source maps" section, unchanged.

**Frontend deploys are manual.** The `groveiq` Cloudflare Pages project is
not Git-connected (`wrangler pages project list` shows `Git Provider: No`)
— pushing to GitHub does **not** deploy the frontend. After any frontend
change: `cd frontend && npm run build && npx wrangler pages deploy dist
--project-name=groveiq`. (The backend Worker deploys normally via `npx
wrangler deploy` from the repo root.)

## UI/UX backlog (user feedback 2026-08-13)

1. [x] Push notifications — see "Push notifications" section above for
   detail.
2. [x] Grove's top status strip redesigned as a bordered stat-cell grid
   (was a flat mono dot-joined line); Environment's metric-card grid fixed
   from an uneven 4+1 wrap to a full 3x2 grid (moved the Sun card into the
   6th slot, removing the duplicate lower on the page); AQI card label
   clarified to "Local AQI" to disambiguate from the regional AirNow line
   below it. Broader "journal feeling" across other screens (Trees,
   Timeline, Insights, Tree Detail) not yet addressed — scope was Grove +
   Environment only per the original backlog item.
3. Grove/Environment: done for the specific complaints raised (see #2) —
   revisit if more screenshots surface further issues.
4. [x] Trend graphs wherever data exists, collapsible via a graph-icon
   toggle per card — matches Ecowitt's dashboard pattern
5. [x] Tree-specific fields (thresholds, notes, origin, age, stage, pot
   size) and profile/account info (collection name, owner, location,
   hardiness zone) are now editable via the UI — see "Editable profiles"
   below for the scoped limitation on this
6. [x] `/privacy` and `/terms` restyled to match the app's design system
   while staying static/JS-free

### Editable profiles — scope note

`GET/PATCH /api/v1/trees/:id` and `GET/PUT /api/v1/settings` (migration
`0011_app_settings.sql`) back real edit forms on Tree Detail and Settings.
Scoped deliberately:

- Grove/Trees list cards and demo sensor readings (soil moisture/EC/temp,
  the insight engine) still come from the static `frontend/src/data/mockData.ts`
  seed, unchanged — editing a tree's thresholds on Tree Detail updates D1
  and the profile fields shown there, but doesn't yet feed back into
  `analyzeTree()`'s status logic on other screens. A full data-wiring pass
  (replacing the mock seed with live D1 reads everywhere) is a separate,
  larger task.
- Tree Detail fetches the live D1 profile on mount and prefers it over the
  mock profile fields once loaded; falls back to the mock values if the
  fetch fails (e.g. local dev, where `api.grove-iq.com` is cross-origin and
  blocked by Access+CORS per `frontend/src/lib/api.ts`'s existing note —
  same-origin `grove-iq.com/api/*` in production doesn't hit this).

## Phase 0 — no hardware needed

- [x] Finalize D1 schema incl. new tables (trees, soil_readings,
      conditions_readings, daily_readings, analyses, milestones, forecasts,
      forecast_alerts_config, journal_entries, chat_messages,
      species_reference, training_log, irrigation_zones, irrigation_events —
      all exist in `schema.sql`)
- [x] Build full frontend against mock/seeded data (5 real trees, redesigned
      UI: Grove/Trees/Environment/Timeline/Insights/Settings)
- [x] Stand up Worker skeleton, deploy to Cloudflare (`api.grove-iq.com` +
      `grove-iq.com` both live)
- [x] Seed the 5 tree profiles into D1 (species, thresholds, origin notes)
- [x] Write species reference entries (4 species covering the 5 trees —
      Alaska Yellow Cedar #1/#2 share one profile)

**Phase 0 is done.**

## Phase 1 — sensors arrive

- [x] Ecowitt account + API keys, gateway MAC confirmed
- [x] Verify real API payload shape against `ecowitt.ts` assumptions (found
      and fixed two real bugs: `pm25_ch1` vs `pm25_aqi`, rainfall unit ID)
- [x] Turn on cron polling, confirm data flowing into D1 (5-min cron live,
      `conditions_readings` populating)
- [ ] **WH52 soil sensors haven't arrived yet** — this is the blocker
- [ ] Map soil channels to trees, seed real thresholds from live data

Everything that doesn't depend on soil sensors specifically is done; per-tree
data (soil moisture/EC/temp, and therefore real tree status) is still demo
until the probes show up.

## Phase 2 — AI layer (core daily-use loop)

> **Hard rule, not just a status note:** never send per-tree soil_readings
> (moisture/EC/temp) to the Anthropic API, or write output into `analyses`
> as if it were a real diagnosis, until WH52 sensors are physically
> installed and soil_readings holds live data. See the guardrail comment at
> the top of `src/claude.ts` before adding any diagnostic function there.

- [x] Anthropic API key configured as a Worker secret — first real AI
      integration exists now (`src/claude.ts`)
- [x] Photo upload (manual) + vision analysis — `POST
      /api/v1/trees/:id/photos` stores to R2, calls Claude Sonnet with the
      photo + species context, writes into `analyses`. Verified end-to-end
      with a real upload through the UI (TreeDetail's Imagery section).
- [x] Current-condition weather alerts (wind/heat/AQI, edge-triggered) plus
      forecast-based alerts (frost tonight, wind gusts — SPEC.md 1.5's exact
      examples), from a real NWS integration (`src/nws.ts`). In-app banner
      only, no email/SMS delivery.
- [x] Local sunrise/sunset/day-length calc (`src/suncalc.ts`), no API/key
      needed — supports Dawn Redwood's day-length dormancy trigger (1.4, 1a)
- [x] AirNow regional AQI (`src/airnow.ts`) — built and wired, but not yet
      activated: `AIRNOW_API_KEY` isn't configured, so it no-ops gracefully.
      Get a free key at docs.airnowapi.org to turn it on.
- [ ] Daily per-tree diagnostic vs. species thresholds — deliberately not
      built yet. Buildable today, but without real soil data it would only
      ever diagnose fake per-tree readings against real (shared) weather —
      confidently-wrong output, the same trust problem the earlier UI audit
      flagged. Waiting on Phase 1's soil sensors to do this honestly.
- [ ] Reolink E1 Outdoor Pro physical install + preset positions — camera
      ordered, not installed. Everything on the *code* side of this is now
      built (2026-08-14), waiting on the hardware:
      - `src/routes/capture.ts` + `capture_requests` table
        (`migrations/0013_capture_requests.sql`): a full command-queue
        endpoint pair mirroring `irrigation.ts`'s `/command`/`/confirm`
        pattern, since the Worker can't reach the camera or a local
        script directly (no public IP on the home network, same
        constraint as the ESP32). `ingestTreePhoto()` extracted out of
        `photos.ts` so manual browser-upload and camera-sourced photos
        share one vision-analysis path, tagged `source: 'manual'` vs.
        `'scheduled'` (the schema already had this column, unused until
        now).
      - `scripts/camera-capture/` — a Node script against Reolink's
        documented local HTTP CGI API, **never run against a real
        camera** since none is installed yet. Three modes: one-shot
        specific-tree capture, `--all --auto` for a daily launchd job,
        and `--watch` (long-running, services the app's new "Capture
        now" button in Tree Detail by polling the request queue).
      - Device-facing endpoints (`/api/v1/capture/command` etc.) are gated
        by a **Cloudflare Access Service Token**
        (`CF-Access-Client-Id`/`-Secret`) rather than a "Bypass" policy —
        Access itself authenticates every request at the edge, not just
        the Worker's own `X-Camera-Key` check. Wired into both
        `capture.mjs`'s `deviceHeaders()` and the ESP32 firmware's
        `camera_task.cpp`. Creating the token and its Access policy was a
        Zero Trust dashboard change the user did.
      - **Architecture decision (2026-08-14)**: rather than the Mac script
        being the production path, the user chose to run capture logic on
        the irrigation ESP32-S3 directly (same board, FreeRTOS-isolated —
        see the "ESP32 camera-capture firmware" section above). The Mac
        script (`scripts/camera-capture/`) remains as a working, bench-
        verified fallback/reference implementation.
      - **Bench-tested independently of this backend** (2026-08-14): the
        user ran a standalone sketch on the ESP32-S3 confirming it can
        reach the Reolink's local snapshot API directly and stream a full
        488KB JPEG in 1.3s with 8.3MB PSRAM still free afterward —
        answers the memory-feasibility question from the earlier
        ESP32-vs-Mac architecture discussion, independent of which device
        ends up running the production capture logic.
      - `CAMERA_DEVICE_KEY` Worker secret generated and set.
- [x] Email alert delivery (Resend) — live, watch+urgent tiers
- [x] SMS consent/verification flow — confirmed working end-to-end live:
      phone entered, disclosure shown, OTP texted and verified, consent
      promoted to `active`, category toggles correctly default off (see
      `docs/sms-compliance-traceability.md`). No categories are checked yet
      by user choice, so nothing sends today even though the pipe is open.
- [ ] **SMS actual delivery** — blocked purely on Twilio's A2P 10DLC
      campaign review (external, out of our hands). First live OTP test hit
      error 30034 (unregistered number) before the user submitted
      Brand+Campaign registration for `+14147683470`. First campaign
      submission then got rejected (error 30909 — insufficient opt-in
      detail); resubmitted 2026-08-15 with a full field-by-field
      description of the real 3-step opt-in flow, verified against actual
      code. Also added a real opt-in confirmation SMS
      (`OPT_IN_CONFIRMATION_TEXT` in `sms/policyVersions.ts`) that didn't
      exist before — surfaced as a genuine gap while answering the
      resubmission form's "what is the opt-in message?" field, since the
      OTP message explicitly disclaims enrolling anyone.
- [x] Cloudflare Access bypass for `/privacy`, `/terms`, and the Twilio
      webhook path — all three added and verified (public pages return 200
      with no login; webhook reaches the Worker's own signature check
      instead of Access's login page)

**Phase 2 has started** — manual photo vision analysis and current-condition
alerts are live. Daily per-tree diagnostics and scheduled camera capture are
still blocked on Phase 1 hardware.

## Phase 3 — depth

- [x] Smart Irrigation Module: Worker↔ESP32 API contract designed,
      documented (`docs/irrigation-api.md`), and implemented — tested
      end-to-end against live D1
- [x] ESP32 firmware scaffolded (PlatformIO), now including the
      camera-capture task (see "ESP32 camera-capture firmware" section
      above). **Camera-capture task flashed and verified live on real
      hardware 2026-08-15** (full pipeline, HTTP 200). **Irrigation logic
      itself (valve control, flow-sensor cross-check) is still
      unflashed/untested** — pin assignments unconfirmed against the
      actual board, no valve/flow-sensor hardware wired up yet
- [ ] Physical valve/drip install, local safety logic verified on real
      hardware — not done, needs the ESP32 physically wired up
- [ ] Comparative insights, dormancy mode — not started (depends on
      Phase 2's AI layer and real soil-sensor history)
- [ ] Milestones, journal entries, training log — schema exists, no UI to
      create/edit any of these (Timeline only *displays* milestones already
      seeded in mock data)

## Phase 4 — conversational + payoff

- [ ] AI chat (Sensei) — not started, no chat UI or `chat_messages` usage
- [ ] Voice input for journal entries — not started
- [ ] Pest/disease seasonal nudges, repotting reminders — not started
- [ ] Time Machine full experience — Timeline screen exists structurally
      (scrubber, event markers, synced metrics) but has no real photos and
      no real per-tree data yet; needs Phase 1 (soil sensors) + camera
- [ ] Annual retrospective — not started, needs a year of data regardless
- [ ] Smart Irrigation AI Mode — not started, needs irrigation_events
      history to exist first

## Cross-cutting / not phase-specific

- [x] Units toggle (US/Metric), applied consistently, persisted
- [x] EC values labeled with units everywhere
- [x] Device health (battery/freshness) surfaced in Settings from live data
- [x] Hover tooltips explaining every displayed metric
- [x] Live vs. demo data clearly labeled throughout the UI
- [x] Cloudflare Access gating both `grove-iq.com` and `api.grove-iq.com` —
      GitHub SSO (email-restricted policy). A Cloudflare Access service
      token (`.cf-access-service-token`, gitignored) lets Claude Code's own
      testing bypass the interactive login.
- [x] **Real bug found and fixed**: Access blocks anonymous CORS preflight
      OPTIONS requests with a bare 403 (browsers never attach credentials to
      a preflight, by the fetch spec) — this silently broke every POST/PUT
      call from the SPA the first time one was actually exercised through a
      real browser (all earlier testing was via `curl` with the service
      token, which never triggers a preflight). Fixed by routing
      `grove-iq.com/api/*` to the same Worker (same-origin, never
      preflights) instead of relying on cross-origin `api.grove-iq.com` +
      `credentials: 'include'`. `api.grove-iq.com` stays live for direct
      testing; local dev falls back to it for GET-only screens.

## Open decisions carried from SPEC.md section 7 (still open)

- ~~NWS forecast lat/long~~ resolved — 47.4776620,-121.7300978
  (user-provided GPS 2026-08-17, previously an approximate placeholder)
  confirmed to resolve to North Bend WA specifically (gridId SEW, gridX
  142, gridY 58), not a generic Seattle station
- AirNow API key not signed up for — code is ready, just needs the key
- Dormancy thresholds are rough per-species guesses, not researched
- Self-tuning threshold auto-apply vs. always-ask: undecided (leaning
  always-ask per spec's own recommendation)
- Voice transcription approach undecided
- Irrigation AI Mode manual-confirm period: undecided
- Reolink mounting/preset count for covering all 5 trees: undecided
- Irrigation GHT↔FPT fitting compatibility: unconfirmed (needs hardware)
- Irrigation rotary switch requires soldering: unconfirmed comfort level

## Module #2 / #3 (Smart Rotation, AI Camera Station)

Concept-stage only per spec section 8.3 — explicitly deferred until Module #1
(irrigation) is fully built, tested, and stable. Not evaluated here.
