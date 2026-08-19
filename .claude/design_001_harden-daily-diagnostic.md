# Design 001: Harden the daily per-tree AI diagnostic

Status: approved 2026-08-17, implementation in progress.

## Context

`docs/GroveIQ-AI-Integration-Roadmap.md` was written to recommend an "Evidence Engine" and audit-grade `analyses` schema, framing the daily sensor diagnostic as entirely unbuilt. Since the doc was drafted, the most recent commit (`9394275`, same day) already shipped a first version: `src/dailyDiagnostic.ts` runs every tree through `diagnoseTreeSensorData()` in `src/claude.ts` once daily via the 13:00 UTC cron, and the result shows up as a read-only "Sensei's daily reading" card on Tree Detail. So the roadmap doc's "current state" section is stale — the diagnostic exists, but in a thin form: it hands Claude near-raw numbers instead of computed features, has no audit trail, and re-diagnoses every tree every day with no dedup protection.

The next step is **hardening this existing diagnostic**: audit-grade schema fields on `analyses`, input-hash dedup so cron retries/debug-route reuse can't create duplicate rows, a shared deterministic Evidence Engine so the AI isn't reasoning from scratch off raw numbers, and anomaly-triggered cadence instead of diagnosing every tree every day regardless of state.

## Central design decision: backend-only Evidence Engine, not a shared frontend/backend module

The backend (Cloudflare Worker) and frontend (Vite/React) are two fully independent packages today — no workspace, no shared module, confirmed no `workspaces` field in either `package.json`. The existing pattern for the one constant they do need to agree on (`MIN_DAYS_FOR_TREND = 3`) is "kept in sync by convention," documented in comments in both `src/claude.ts` and `frontend/src/data/realTreeAnalysis.ts`.

Building a true shared module (frontend fetching computed evidence from the backend instead of running `analyzeTreeReal()` client-side) would mean refactoring `useTreeInsights()`, which drives status badges/alerts across 8+ components (Grove, Trees, TreeDetail, Timeline, Insights, TreeCompare, sidebar, Environment). That's a much larger, separately-risky change than "harden the diagnostic," and doesn't fit this repo's evident preference for small, additive, independently-shippable commits.

**Decision**: build `src/evidenceEngine.ts` as a backend-only module that computes features from D1 data, feeds the Claude prompt, and gets persisted to `evidence_json`. It includes a backend-local mirror of `analyzeTreeReal()`'s exact thresholding math (same constants, same `decliningFast`/`daysToThreshold` formulas), unit-tested for numeric parity against the frontend's logic — shrinking the mismatch surface from "ad hoc prompt text" to "one well-tested backend function," without a structural refactor. The frontend's `realTreeAnalysis.ts` is untouched; status badges keep working exactly as today. Full frontend integration (fetching evidence from a new endpoint) is explicit future work, not part of this pass.

**Known trade-off accepted**: the backend mirror and `realTreeAnalysis.ts` remain two copies, not one import — they can still drift apart over time. The mitigation is the parity unit tests, not a structural guarantee.

## Implementation, in order

### 1. Migration `migrations/0015_analyses_evidence_and_dedup.sql` + `schema.sql`

Add nullable columns to `analyses` (no backfill, matching existing migration convention like `0007`/`0014`):

- `provider` TEXT
- `model_version` TEXT — the Anthropic response's *resolved* model (distinct from existing `model`, which stores the requested string)
- `prompt_version` TEXT — small hand-bumped constant, e.g. `'sensor-v1'`
- `input_hash` TEXT
- `evidence_json` TEXT — exact evidence object shown to Claude
- `output_json` TEXT — raw parsed Claude response
- `confidence` TEXT, `CHECK (confidence IN ('low','medium','high') OR confidence IS NULL)`
- `data_start_ts` / `data_end_ts` TEXT — bounds of the evidence window

Not adding `error_code`: `analyses.status` has a `CHECK` with no failure state, and giving it a home means loosening that constraint for a field that isn't clearly load-bearing. Instead, improve error string prefixes in the existing `errors: string[]` array returned by `runDailyDiagnostics` (e.g. `NO_API_KEY:`, `ANTHROPIC_HTTP_500:`, `PARSE_ERROR:`, `VALIDATION_ERROR:`).

Dedup: `CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_tree_input_hash ON analyses(tree_id, input_hash);`. SQLite treats `NULL` as distinct per-row for uniqueness, so this is a no-op for all existing rows (`vision`/`comparative`/`retrospective`, and historical `sensor` rows with no hash) — safe to add without a backfill. Application code does a `SELECT`-before-insert for clear "already diagnosed today" logging, with the unique index as a backstop (caught, treated as a non-error skip, not pushed into `errors`). Not using `INSERT OR IGNORE` — it would silently swallow constraint violations, working against this pass's own reliability goal.

`input_hash = sha256(JSON.stringify({tree_id, date, evidence}))`, truncated to 16 hex chars, via the Workers runtime's `crypto.subtle.digest` (no new dependency). Hashing the full evidence object rather than just `tree_id`+`date` means: same-day retries with unchanged D1 state produce the same hash (deduped), but a mid-day evidence change (e.g. conditions worsening) produces a different hash and is correctly allowed as an updated diagnosis rather than silently suppressed.

Needs a `todayGroveLocalDateStr` helper alongside the existing `yesterdayGroveLocalDateStr` in `src/dailyRollup.ts` (both can share the existing `groveLocalDayBoundsUtc` internals) to compute the hash's date component using the same grove-local-day convention already used elsewhere, not UTC.

`schema.sql`'s `analyses` table definition (currently lines 94-108) gets the same columns/index added inline, matching the repo's convention of keeping it as the reconciled cumulative file alongside migrations.

### 2. `src/evidenceEngine.ts` (new) + `src/evidenceEngine.test.ts` (new)

Pure, synchronous — no D1/fetch calls inside; all I/O stays in `dailyDiagnostic.ts`. Signature: `computeEvidence(input: EvidenceEngineInput): Evidence`.

Realistic v1 feature set, scoped to what ~14 days of real history and 5 trees actually support:

- **Reading + age + coarse state**: extends existing `readingAgeHours` with `'reporting' | 'stale' | 'likely-offline'` (>1h / >6h).
- **Time below/above the single configured threshold over the last 24h**: summed from consecutive raw `soil_readings` crossings. (Not separate watch/urgent bands — the schema only has one threshold pair; don't invent a second band it doesn't have.)
- **Moisture change over 1h/6h/12h/24h**: diff current reading against the closest raw `soil_readings` row to each window boundary. Requires a new query in `dailyDiagnostic.ts` — last ~24-48h of raw 5-min rows per tree (trivial volume at 5 trees).
- **Watering-event detection**: a rise of ≥5 percentage points within a rolling 30-minute window (6 samples). Annotate as "possibly rain, not confirmed watering" when `conditions_readings` shows meaningful rain in the same window (conditions are grove-wide, not per-tree, so can't fully disambiguate).
- **Post-watering peak + dry-down slope**: simple secant slope `(peakValue - currentValue) / hoursSincePeak`, not a regression — matches the project's existing "simple day-over-day diff" style.
- **EC/temp anomalies**: current EC vs. `ec_threshold_high` and vs. 7-day daily-average EC (>30% relative deviation); same pattern for soil temp vs. `dormancy_soil_temp_c`. Reuses data already fetched.
- **Weather over the same period**: widen the existing single-latest-row `conditions_readings` query to a ~24h window, aggregate wind max / rain total / humidity avg / solar avg in JS.
- **Own-baseline comparison**: trailing 14-day mean of `daily_readings.soil_moisture_avg` vs. current.
- **Yellow Cedar comparison**: generic species-based sibling lookup (`WHERE species = ? AND id != ?`), not hardcoded tree IDs — informational only, not used in status math.
- **Missing-data warnings**: combine existing staleness/thin-history checks with a gap check (max interval between consecutive raw readings > ~30 min vs. expected 5-min cadence).
- **Mirrored deterministic status**: backend-local port of `analyzeTreeReal()`'s exact math (same `MIN_DAYS_FOR_TREND=3`, same `decliningFast = changePct<0 && abs(changePct)>max(typicalSwing*2,3)`, same `daysToThreshold<1.5` cutoff), computed from `dailyHistory` to preserve numeric parity with the frontend. Included in `evidence_json`/prompt as a labeled fact for Claude to react to — does **not** overwrite `analyses.status`, which stays Claude's own field exactly as today.

Explicitly out of scope for v1 (flag as future work in code comments): canopy-specific solar exposure, true seasonal baselines, calibrated-vs-uncalibrated sensor detection — none of the underlying data exists yet.

### 3. Anomaly-triggered cadence, inside `runDailyDiagnostics`

No new table — query `analyses` itself for the most recent `kind='sensor'` row per tree. At the existing 13:00 UTC cron:

1. Compute mirrored status via the Evidence Engine.
2. Look up the last `kind='sensor'` analyses row for that tree.
3. Gate: mirrored status `!= 'ok'` → diagnose (covers both new and ongoing anomalies). Mirrored status `== 'ok'` and last diagnosis ≥7 days old (or none) → diagnose (weekly summary for stable trees). Otherwise → skip, counted under a new `treesSkippedStable`.

Extract the decision as a pure, unit-testable function: `shouldRunDiagnostic(mirroredStatus, lastAnalysis: {status, ts} | null, now: Date): {run: boolean, reason: string}`, tested in a new `src/dailyDiagnostic.test.ts` — following the existing precedent that pure logic gets unit tests while D1-wiring gets debug-route verification (see `dailyRollup.test.ts`, which only tests the pure date helper, not the D1-touching rollup itself).

**Deferred to a separate follow-up commit, not this pass**: true "immediate diagnosis the moment a new anomaly appears" needs a sub-daily trigger, since the once-daily cron structurally can't provide it. The natural hook is the existing `*/5 * * * *` Ecowitt-poll handler in `src/index.ts` — after `writeSoilReadings`, run the (Claude-free) mirrored-status check, and on a first `ok → (watch|urgent)` transition with ≥60 min since the last diagnosis, dispatch the Claude call via `ctx.waitUntil(...)` so an Anthropic hiccup can't add latency/risk to the core sensor-ingestion path. This is the single riskiest piece of the whole plan (touches the highest-frequency code path in the system) and should land only after the daily-cadence gate above has a track record — call this out as a known follow-up rather than building it now.

### 4. `src/claude.ts` prompt + persistence

- `Diagnosis` gains `confidence: 'low'|'medium'|'high'`, validated by extending the existing hand-rolled field check in `callClaudeForDiagnosis` (no new dependency — no schema-validation library exists in either package today, and one field doesn't justify adding one).
- `diagnoseTreeSensorData` takes the `Evidence` object and embeds `JSON.stringify(evidence)` in the prompt with a short framing paragraph, replacing today's manually-formatted history lines — a genuine simplification, and it guarantees `evidence_json` persisted is exactly what Claude saw (auditable).
- **Not adopting** the roadmap's richer `observations`/`hypotheses`/`actions` output contract this pass — the "Sensei's daily reading" card only renders `summary`+`detail` today, so the added JSON-parsing surface/cost has no current UI payoff. Revisit once there's a concrete rendering reason.
- Parsing path stays structurally the same (markdown-fence strip + `JSON.parse` + hand-validation), just with `confidence` added to the validated fields.
- `dailyDiagnostic.ts`'s insert extends to populate `provider`, `model_version`, `prompt_version`, `evidence_json`, `output_json`, `confidence`, `data_start_ts`, `data_end_ts`, `input_hash`.

### 5. Testing

- `src/evidenceEngine.test.ts`: unit tests per pure helper — window-diff math, watering-event threshold boundary (4.9pt/30min → no event, 5.0pt → event), dry-down slope on a synthetic decline, and mirrored-status parity cases cross-referenced against `frontend/src/data/realTreeAnalysis.ts`'s logic (note: that file has no test file of its own today — a pre-existing gap, not introduced or fixed here).
- Extend `src/claude.test.ts` with `confidence` validation cases, matching the existing `stalenessNote`/`trendNote` test style.
- New `src/dailyDiagnostic.test.ts` for the pure `shouldRunDiagnostic` cadence function.
- End-to-end: `GET /api/debug/diagnostic` (existing route, unchanged) exercises the full flow once deployed. **Note**: CHECKLIST.md documents that an actual live diagnostic run through the deployed Worker has *not* been verified yet — it doesn't confirm `ANTHROPIC_API_KEY` is live as a Worker secret, only that this hasn't been exercised from the dev environment. Everything through step 3 above (schema, Evidence Engine, dedup, cadence gating) is fully testable without a live key; only the actual Claude call needs deployment + a working secret, so plan to hit `/api/debug/diagnostic` post-deploy to confirm.

## Files to create/modify

- `migrations/0015_analyses_evidence_and_dedup.sql` (new)
- `schema.sql` — extend `analyses` table + unique index (~lines 94-108)
- `src/evidenceEngine.ts` (new)
- `src/evidenceEngine.test.ts` (new)
- `src/dailyDiagnostic.ts` — extend queries (raw soil window, conditions window, sibling lookup), wire Evidence Engine, dedup check, cadence gate
- `src/dailyDiagnostic.test.ts` (new) — `shouldRunDiagnostic` tests
- `src/claude.ts` — prompt rebuilt around evidence JSON, `confidence` field + validation
- `src/claude.test.ts` — extend with `confidence` cases
- `src/dailyRollup.ts` — add `todayGroveLocalDateStr`
- `src/index.ts` — untouched in this pass (the `*/5` cron hook is explicitly deferred)

## Verification

1. `npx tsc --noEmit -p .` from repo root (backend only — frontend needs its own `cd frontend && tsc -b`, unaffected here since frontend isn't touched).
2. `npm test` — full suite including new `evidenceEngine.test.ts`, `dailyDiagnostic.test.ts`, extended `claude.test.ts`.
3. Apply migration `0015` locally (`wrangler d1 migrations apply` per existing convention) and confirm `schema.sql` matches.
4. Hit `GET /api/debug/diagnostic` locally/against a dev D1 with real seeded soil data; confirm: no duplicate `analyses` rows on a second immediate call (dedup), stable trees get skipped per the weekly gate, `evidence_json`/`output_json`/`input_hash` populate correctly.
5. Once deployed, hit the same debug route against production to confirm the live Claude call path works end-to-end and the Tree Detail "Sensei's daily reading" card still renders correctly with the new fields present but no UI changes required.
