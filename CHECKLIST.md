# GroveIQ Build Checklist

Tracks progress against `SPEC.md`'s phasing (section 6). Update this
alongside real changes — it's a snapshot, not a source of truth; the code
and `SPEC.md` are authoritative when they disagree with this file.

Last updated: 2026-08-13 (Phase 2 started).

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

- [x] Anthropic API key configured as a Worker secret — first real AI
      integration exists now (`src/claude.ts`)
- [x] Photo upload (manual) + vision analysis — `POST
      /api/v1/trees/:id/photos` stores to R2, calls Claude Sonnet with the
      photo + species context, writes into `analyses`. Verified end-to-end
      with a real upload through the UI (TreeDetail's Imagery section).
- [x] Current-condition weather alerts (wind/heat/AQI, edge-triggered) —
      **not** the NWS-forecast-based frost/wind-gust alerts SPEC.md 1.5
      describes; see the open decision below. In-app banner only, no
      email/SMS delivery.
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
- [ ] Forecast-based alerts (frost tonight, wind gusts >25mph per spec's
      exact examples) — not started; no NWS or AirNow integration exists
      (`forecasts` and `forecast_alerts_config` tables exist in schema but
      are unused). Current-condition alerts (wind/heat/AQI right now, not
      forecasted) exist as of Phase 2 — see above; this is the remaining,
      more faithful-to-spec half.
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

## Open decisions carried from SPEC.md section 7 (still open)

- NWS forecast lat/long for the grove not yet confirmed/wired
- AirNow API key not signed up for (currently relying on Ecowitt's own
  PM2.5/AQI instead — reasonable substitute, but not what spec described)
- Dormancy thresholds are rough per-species guesses, not researched
- Self-tuning threshold auto-apply vs. always-ask: undecided (leaning
  always-ask per spec's own recommendation)
- Voice transcription approach undecided
- Irrigation AI Mode manual-confirm period: undecided
- Reolink mounting/preset count for covering all 5 trees: undecided
- Irrigation GHT↔FPT fitting compatibility: unconfirmed (needs hardware)
- Irrigation rotary switch requires soldering: unconfirmed comfort level
- Alerts currently cover current-condition wind/heat/AQI, not spec 1.5's
  forecast-based frost/wind-gust examples — worth deciding whether NWS
  integration is worth doing for the forecast half, or if current-condition
  coverage is good enough for personal-scale use

## Module #2 / #3 (Smart Rotation, AI Camera Station)

Concept-stage only per spec section 8.3 — explicitly deferred until Module #1
(irrigation) is fully built, tested, and stable. Not evaluated here.
