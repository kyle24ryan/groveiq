# GroveIQ Build Checklist

Tracks progress against `SPEC.md`'s phasing (section 6). Update this
alongside real changes — it's a snapshot, not a source of truth; the code
and `SPEC.md` are authoritative when they disagree with this file.

Last updated: 2026-08-13 (Grove/Environment design pass — see below; deploy process note added).

**Frontend deploys are manual.** The `groveiq` Cloudflare Pages project is
not Git-connected (`wrangler pages project list` shows `Git Provider: No`)
— pushing to GitHub does **not** deploy the frontend. After any frontend
change: `cd frontend && npm run build && npx wrangler pages deploy dist
--project-name=groveiq`. (The backend Worker deploys normally via `npx
wrangler deploy` from the repo root.)

## UI/UX backlog (user feedback 2026-08-13)

1. Push notifications — new delivery channel, no service worker/subscription
   flow exists yet
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
