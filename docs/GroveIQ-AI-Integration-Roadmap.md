# GroveIQ AI Integration Roadmap

## Executive summary

GroveIQ is ready for a meaningful AI layer, but the best direction is **AI over verified evidence**, not replacing the existing rules with an LLM. The sensors, weather data, species profiles, photographs, alerts, and irrigation event model already form a strong foundation.

The most important architectural principle should be:

> GroveIQ should use AI to synthesize and communicate evidence, while ordinary code remains responsible for measurement, thresholds, persistence, safety constraints, and actuation.

## Current state

There are three different intelligence layers in the code today.

### 1. Deterministic monitoring

Moisture thresholds, drying-rate checks, weather alerts, status ranking, and projections are computed with ordinary code. This is the correct foundation for safety-critical behavior.

### 2. AI vision

Uploaded photographs are sent to Claude with species context, producing an `ok`, `watch`, or `urgent` status, plus a summary and detail. Results are stored in the `analyses` table.

Relevant files:

- `src/claude.ts`
- `src/routes/photos.ts`
- `schema.sql`

### 3. Partially implemented sensor diagnostics

The working tree contains an uncommitted `diagnoseTreeSensorData()` function in `src/claude.ts`, but it is not called anywhere. Its comment refers to `src/dailyDiagnostic.ts`, which does not exist, and the daily cron currently stops after forecasts, AirNow, and daily rollups.

The daily diagnosis is therefore not operational yet. It is an in-progress prompt without orchestration, persistence, display integration, or tests.

### Checklist inconsistencies

`CHECKLIST.md` still contains older status markers saying that the soil sensors have not arrived and that the daily diagnostic remains blocked. Earlier sections correctly document that the sensors are installed and that the frontend uses real readings.

The checklist should be reconciled before it is used as the authoritative roadmap.

## Primary architectural recommendation: an Evidence Engine

Build a server-side **Evidence Engine** first, then let AI explain its output.

Some core interpretation currently lives only in the browser in `frontend/src/data/realTreeAnalysis.ts`. A scheduled backend diagnosis can therefore disagree with the frontend because the two layers are not consuming one shared analysis result.

The Evidence Engine should turn raw readings into compact, deterministic facts such as:

- Current reading and reading age
- Calibrated or uncalibrated sensor state
- Time below watch and urgent bands
- Time above the wet band
- Moisture change over 1, 6, 12, and 24 hours
- Watering events inferred from sharp moisture increases
- Post-watering peak and dry-down slope
- EC and temperature anomalies
- Heat, wind, rain, humidity, and solar exposure over the same period
- Comparison with the tree's own baseline
- Comparison with the other Yellow Cedar
- Missing-data or sensor-quality warnings

AI should receive those facts—not hundreds of five-minute readings—and return a structured synthesis.

A useful output contract would look conceptually like this:

```ts
type Diagnostic = {
  status: 'ok' | 'watch' | 'urgent';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  observations: Array<{
    statement: string;
    evidenceIds: string[];
  }>;
  hypotheses: Array<{
    statement: string;
    confidence: 'low' | 'medium' | 'high';
    evidenceFor: string[];
    evidenceAgainst: string[];
  }>;
  actions: Array<{
    action: string;
    urgency: 'today' | 'soon' | 'monitor';
    requiresConfirmation: boolean;
  }>;
};
```

Requiring `evidenceIds` would make it much harder for the model to invent heat, watering, or disease explanations unsupported by GroveIQ's data.

## Recommended AI roadmap

### 1. Finish the daily evidence-backed diagnostic

This is the natural next milestone from Phase 2 of the checklist.

Implement the missing orchestration so that it:

- Runs after the daily rollup
- Skips trees with stale or insufficient data
- Computes deterministic features first
- Calls AI only when there is something useful to interpret
- Stores the structured input facts and output
- Uses an input hash so cron retries cannot create duplicate diagnoses
- Shows the persisted diagnosis alongside the same evidence in Intelligence and Tree Detail

AI does not need to run every day for every stable tree. A better cadence is:

- Generate an immediate diagnosis when a new anomaly appears
- Generate a daily update while an anomaly remains active
- Generate a quiet weekly summary for stable trees

This reduces cost and noise and makes “Sensei has something to say” meaningful.

### 2. Build a moisture-calibration coach

This should come before self-tuning thresholds.

GroveIQ can detect watering events from a large upward moisture step, then learn the following for each sensor:

- Post-drainage wet reference
- Typical pre-watering dry reference
- Median daily dry-down
- Seasonal variation
- How outdoor heat and wind change dry-down

The calculations should be deterministic. AI should explain the recommendation and the evidence behind it.

Example:

> Tipsoo typically rises from 13 to 44 after watering and reaches 16 before the next watering. GroveIQ recommends changing its watch threshold from 12 to 16.

Threshold changes should remain user-approved, matching the checklist's current preference to ask before applying self-tuning changes.

### 3. Upgrade photo analysis from snapshots to change detection

The existing vision prompt evaluates one image in isolation. The more valuable capability is longitudinal comparison:

- Current photograph versus the previous capture
- Current photograph versus a healthy seasonal baseline
- Same camera preset and similar time of day
- Sensor and weather context for the interval between images

The analysis should return separate fields for:

- Direct visual observations
- Change since the previous image
- Image-quality limitations
- Possible explanations
- Confidence
- Recommended close-up or alternate angle

For example, GroveIQ should be able to say that browning increased in one region of the Silver Fir while explicitly distinguishing that observation from a diagnosis.

The scheduled Reolink pipeline makes this promising, but consistent PTZ presets and framing are prerequisites. Computer vision becomes more reliable when the tree occupies the same portion of each image.

### 4. Add comparative intelligence for the two Yellow Cedars

This is probably GroveIQ's best early AI-native feature because the two trees share a species and deck weather.

The deterministic layer should compare:

- Moisture response after the same rain or watering period
- Dry-down rate
- Soil temperature
- EC
- Growth and photographic changes
- Recovery status

AI can then summarize meaningful divergence.

Example:

> Cedar #2 has dried approximately 30% faster than Cedar #1 after three comparable wetting events. Because both experienced the same outdoor conditions, inspect emitter coverage, probe contact, root density, or substrate differences.

This is more defensible than trying to attribute a single tree's change directly to weather.

### 5. Make Sensei a tool-using interface

Sensei should query GroveIQ through narrow tools rather than act as a free-form chatbot.

Potential tools include:

- `get_tree_current_state`
- `get_tree_history`
- `get_recent_diagnostics`
- `get_photo_timeline`
- `compare_trees`
- `get_species_guidance`
- `get_training_history`
- `draft_journal_entry`
- `propose_threshold_change`
- `propose_irrigation`

The model should never construct arbitrary SQL or directly operate valves. Read operations can happen automatically; configuration changes, journal writes, and irrigation requests should require confirmation.

Use a provider-neutral boundary so GroveIQ is not permanently tied to one model vendor:

```ts
interface GroveAIProvider {
  analyzePhoto(input: PhotoAnalysisInput): Promise<PhotoAnalysis>;
  synthesizeDiagnostic(input: DiagnosticEvidence): Promise<Diagnostic>;
  answerWithTools(input: SenseiRequest): Promise<SenseiResponse>;
}
```

### 6. Turn voice input into structured care records

Voice input should initially be asynchronous and simple:

1. Transcribe the recording.
2. Extract a draft journal or training-log record.
3. Show the user the draft.
4. Save only after confirmation.

For example, “Repotted Tipsoo today into the same conifer mix and trimmed about ten percent of the roots” could become:

```json
{
  "treeId": "silver-fir",
  "date": "2026-08-18",
  "entryType": "training",
  "action": "repot",
  "note": "Repotted into the same conifer mix; approximately 10% root reduction."
}
```

This would activate the unused `journal_entries` and `training_log` tables while creating valuable context for future diagnoses.

### 7. Build dormancy and seasonal-care intelligence

Dormancy should combine deterministic signals:

- Soil-temperature duration, not a single threshold crossing
- Day-length trend
- Species
- Recent growth and photographic state
- Dawn Redwood needle-drop season
- Local forecast

AI can translate those signals into a seasonal state and care explanation, but should not decide dormancy from one temperature value.

Seasonal pest and care reminders can use the same system, grounded in curated species records rather than unconstrained web knowledge.

### 8. Keep AI advisory-only for irrigation

Smart Irrigation AI Mode should be the last major integration.

The safe division of responsibility is:

- Firmware owns maximum runtime, flow verification, leak detection, and fail-closed behavior
- Deterministic backend rules decide whether irrigation is permissible
- AI recommends timing or duration and explains why
- The user confirms the action
- Limited automation is considered only after a substantial history of approved recommendations

AI should never bypass local safety logic or directly turn an uncertain diagnosis into valve activation.

## Schema and reliability improvements

The current `analyses` table is too prose-oriented for a mature AI system. It stores status, summary, detail, model, and optionally a photograph, but not enough information to reproduce or audit a diagnosis.

Recommended fields include:

- `provider`
- `model_version`
- `prompt_version`
- `input_hash`
- `evidence_json`
- `output_json`
- `confidence`
- `data_start_ts`
- `data_end_ts`
- `supersedes_analysis_id`
- `user_feedback`
- `reviewed_at`
- `error_code`
- Token, latency, and cost metadata

Other important improvements:

- Replace manual Markdown-fence stripping and `JSON.parse()` with schema-validated responses
- Do not return provider error bodies verbatim to clients
- Record failed AI jobs rather than only throwing errors
- Add retry limits and timeouts
- Continue retaining the original photograph when analysis fails
- Add an explicit `uncertain` or `insufficient_data` outcome rather than forcing everything into `ok`, `watch`, or `urgent`
- Add user feedback such as “helpful,” “wrong,” “I watered,” or “false alarm”

## Evaluation strategy

Before expanding Sensei or introducing irrigation recommendations, assemble a GroveIQ-specific evaluation set containing cases such as:

- Healthy tree with normal readings
- Real low-moisture event
- Stale sensor
- Post-watering spike
- Coarse-substrate low readings
- Dawn Redwood normal seasonal needle change
- Ambiguous photograph
- Two Yellow Cedars diverging
- Missing weather data
- Conflicting photographic and sensor evidence
- Prompt-injection text placed in a journal entry

Grade each model response for:

- Status correctness
- Whether every claim is supported
- Whether uncertainty is stated
- Whether the recommended action is safe
- Whether species seasonality is respected
- Whether it avoids invented causality
- Whether it declines to diagnose when evidence is inadequate

This matters more than choosing the nominally best model. Model and reasoning configurations should be compared on representative GroveIQ cases before being adopted.

## Suggested implementation order

1. Reconcile `CHECKLIST.md` and resolve the unfinished `src/claude.ts` work.
2. Move shared feature and status computation to a backend or shared module.
3. Add structured evidence and audit fields.
4. Ship anomaly-triggered daily diagnostics.
5. Add calibration recommendations with user approval.
6. Add longitudinal photograph comparison.
7. Add Yellow Cedar comparative insights.
8. Activate journal and training logs with voice drafting.
9. Build tool-based Sensei chat.
10. Add dormancy and seasonal planning.
11. Pilot confirmation-only irrigation recommendations.
12. Build annual retrospectives once enough history exists.

## Conclusion

GroveIQ's greatest opportunity is not a generic bonsai chatbot. It is a system that notices meaningful changes, connects them to verified evidence, communicates uncertainty honestly, and recommends safe next actions.

Keeping the evidence layer deterministic and the AI layer explanatory will make the product more useful, more auditable, and much safer as it eventually expands into calibration, longitudinal vision, conversational access, and irrigation assistance.
