# GroveIQ Build Checklist

Tracks progress against `SPEC.md`'s phasing (section 6). Update this
alongside real changes — it's a snapshot, not a source of truth; the code
and `SPEC.md` are authoritative when they disagree with this file.

Last updated: 2026-08-13 (NWS/AirNow/sun-calc landed).

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
- [ ] Email/SMS alert delivery (Resend/Twilio) — alert *detection* exists,
      delivery doesn't; no accounts/keys set up

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
- [ ] **No auth anywhere** — `grove-iq.com` is fully public, and
      `POST /api/v1/trees/:id/photos` (real Anthropic spend) and
      `POST /api/v1/irrigation/water` (real-world valve trigger) are
      publicly writable with zero auth. Decided on Cloudflare Access
      (edge-level login, zero app code) as the fix — next up.

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
