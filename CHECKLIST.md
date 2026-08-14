# GroveIQ Build Checklist

Tracks progress against `SPEC.md`'s phasing (section 6). Update this
alongside real changes — it's a snapshot, not a source of truth; the code
and `SPEC.md` are authoritative when they disagree with this file.

Last updated: 2026-08-14 (push notifications; error-message audit).

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
- [ ] Reolink E1 Outdoor Pro install + preset positions, wire scheduled
      capture into the vision pipeline — camera ordered, not installed; the
      vision pipeline itself is built and camera-agnostic, so this is a
      hardware-install task once the camera's mounted, not new code.
- [x] Email alert delivery (Resend) — live, watch+urgent tiers
- [x] SMS consent/verification flow — confirmed working end-to-end live:
      phone entered, disclosure shown, OTP texted and verified, consent
      promoted to `active`, category toggles correctly default off (see
      `docs/sms-compliance-traceability.md`). No categories are checked yet
      by user choice, so nothing sends today even though the pipe is open.
- [ ] **SMS actual delivery** — blocked purely on Twilio's A2P 10DLC
      campaign review (external, out of our hands). First live OTP test hit
      error 30034 (unregistered number) before the user submitted
      Brand+Campaign registration for `+14147683470`.
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
- [x] ESP32 firmware scaffolded (PlatformIO) — **written but never flashed
      or run on real hardware**; pin assignments unconfirmed against the
      actual board
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

- ~~NWS forecast lat/long~~ resolved — 47.49,-121.7871 confirmed to resolve
  to North Bend WA specifically (gridId SEW), not a generic Seattle station
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
