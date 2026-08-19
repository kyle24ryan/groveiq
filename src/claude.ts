import type { Env } from './env';
import type { Evidence } from './evidenceEngine';

// Guardrail history: this file used to hard-block any sensor-based daily
// diagnostic until (a) real soil sensors existed and (b) the frontend was
// wired off mock data, specifically to avoid Claude confidently diagnosing
// a fake tree in a way indistinguishable from a real diagnosis in the UI.
// Both conditions were met 2026-08-18 (soil sensors installed and
// reporting; frontend fully wired onto real soil_readings/daily_readings
// via useTreeInsights). diagnoseTreeSensorData() below is the resulting
// function -- see src/dailyDiagnostic.ts for how it's called and
// CHECKLIST.md for status. Its prompt is deliberately built to carry the
// same honesty constraints as the rule-based engine it sits alongside
// (frontend/src/data/realTreeAnalysis.ts): explicit about provisional/
// uncalibrated thresholds, explicit about thin history, no invented cause.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-5';

export type Diagnosis = {
  status: 'ok' | 'watch' | 'urgent';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  detail: string;
};

// modelVersion is the Anthropic response's own resolved `model` field,
// distinct from the CLAUDE_MODEL string we requested with -- captures
// drift if the requested model is ever an alias resolving to a dated
// snapshot. Kept alongside Diagnosis rather than folded into it since it
// describes the call, not the model's opinion.
export type ClaudeCallResult = Diagnosis & { modelVersion: string };

// Extracted as a pure, exported function (rather than inlined in the
// try/catch below) so it's unit-testable without mocking fetch -- same
// reasoning as stalenessNote/trendNote above.
export function isValidDiagnosisShape(parsed: unknown): parsed is Diagnosis {
  const p = parsed as Partial<Diagnosis> | null | undefined;
  return (
    !!p && ['ok', 'watch', 'urgent'].includes(p.status as string) && ['low', 'medium', 'high'].includes(p.confidence as string) && !!p.summary && !!p.detail
  );
}

// Short prefixes on every thrown error below (NO_API_KEY/ANTHROPIC_HTTP_*/
// PARSE_ERROR/VALIDATION_ERROR) so callers collecting these into a plain
// string array (runDailyDiagnostics' `errors`) can distinguish failure
// modes without a schema change -- see migrations/0015's comment on why
// `analyses` doesn't get an error_code column.
async function callClaudeForDiagnosis(env: Env, content: unknown): Promise<ClaudeCallResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('NO_API_KEY: ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      // Bumped from 1024 (2026-08-18): the evidence-JSON-embedded sensor
      // prompt produces noticeably richer detail text than the old
      // raw-numbers prompt -- live testing hit real truncation at 1024 on
      // a tree with more evidence to discuss (multiple watering events,
      // companion comparison, etc.), both as a visibly cut-off JSON string
      // and, on at least one tree, as a fully empty response (max_tokens
      // exhausted before any text was flushed).
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ANTHROPIC_HTTP_${response.status}: ${errText}`);
  }

  const body = (await response.json()) as { content: { type: string; text?: string }[]; stop_reason?: string; model?: string };
  const textBlock = body.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    const truncated = body.stop_reason === 'max_tokens' ? ' (stop_reason was max_tokens -- likely ran out of budget before writing any text)' : ` (stop_reason: ${body.stop_reason ?? 'unknown'})`;
    throw new Error(`PARSE_ERROR: No text content in analysis response${truncated}`);
  }

  const jsonText = textBlock.text
    .trim()
    .replace(/^```(json)?\n?/, '')
    .replace(/```$/, '')
    .trim();

  let parsed: Diagnosis;
  try {
    parsed = JSON.parse(jsonText) as Diagnosis;
  } catch {
    const truncated = body.stop_reason === 'max_tokens' ? ' (response was cut off at max_tokens)' : '';
    throw new Error(`PARSE_ERROR: Response wasn't valid JSON${truncated}: ${jsonText.slice(0, 200)}`);
  }

  if (!isValidDiagnosisShape(parsed)) {
    throw new Error(`VALIDATION_ERROR: Response missing required fields: ${jsonText.slice(0, 200)}`);
  }

  return { ...parsed, modelVersion: body.model ?? CLAUDE_MODEL };
}

export async function analyzeTreePhoto(
  env: Env,
  params: { imageBase64: string; mediaType: string; treeName: string; species: string; speciesNotes?: string }
): Promise<ClaudeCallResult> {
  const prompt = `You are Sensei, GroveIQ's bonsai health advisor. Examine this photo of "${params.treeName}" (${params.species}) for signs of pest damage, disease, discoloration, wilting, or other health concerns.
${params.speciesNotes ? `\nSpecies-specific context: ${params.speciesNotes}` : ''}

Distinguish what you directly observe in the image from what you're inferring. Don't overstate certainty from a single photo. If the species is a normal deciduous conifer and needle color looks seasonal rather than diseased, say so rather than flagging it.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"status": "ok" | "watch" | "urgent", "confidence": "low" | "medium" | "high", "summary": "<one sentence, plain language>", "detail": "<2-4 sentences: what you observed, whether it's concerning, and why>"}`;

  return callClaudeForDiagnosis(env, [
    { type: 'image', source: { type: 'base64', media_type: params.mediaType, data: params.imageBase64 } },
    { type: 'text', text: prompt },
  ]);
}

export type SensorDiagnosisParams = {
  treeName: string;
  species: string;
  speciesNotes?: string;
  developmentStage: string;
  thresholds: { moistureLow: number; moistureHigh: number; ecHigh: number; dormancySoilTempC: number };
  evidence: Evidence;
};

// Same minimum-history threshold as the frontend's rule-based engine
// (frontend/src/data/realTreeAnalysis.ts's MIN_DAYS_FOR_TREND) -- kept in
// sync by convention, not by import, since this runs in a separate
// package (backend Worker vs. frontend bundle). src/evidenceEngine.ts
// imports this constant directly (same package, so a real import there,
// not just convention) to keep its mirrored status logic using the exact
// same cutoff.
export const MIN_DAYS_FOR_TREND = 3;
export const STALE_READING_HOURS = 1;

export function stalenessNote(readingAgeHours: number): string {
  return readingAgeHours > STALE_READING_HOURS
    ? `This reading is ${readingAgeHours.toFixed(1)} hours old -- the sensor may be offline or out of range. Factor this into your confidence and say so if relevant.`
    : '';
}

export function trendNote(daysOfHistory: number): string {
  return daysOfHistory < MIN_DAYS_FOR_TREND
    ? `Fewer than ${MIN_DAYS_FOR_TREND} days of daily history exist -- do not claim a trend or rate of change. Say the history is still building instead.`
    : '';
}

export async function diagnoseTreeSensorData(env: Env, params: SensorDiagnosisParams): Promise<ClaudeCallResult> {
  const { evidence } = params;

  const prompt = `You are Sensei, GroveIQ's bonsai health advisor. Review this tree's deterministic sensor evidence -- computed by ordinary code, not inferred by you -- and write a short, honest daily diagnostic.

Tree: ${params.treeName} (${params.species}, ${params.developmentStage} stage)
${params.speciesNotes ? `Species notes: ${params.speciesNotes}\n` : ''}
Configured thresholds (PROVISIONAL -- not yet calibrated per-sensor; this Ecowitt probe reports a substrate-dependent moisture index, not a universal soil-water percentage, so a reading outside these is worth mentioning, not certain fact): moisture ${params.thresholds.moistureLow}-${params.thresholds.moistureHigh}%, EC ceiling ${params.thresholds.ecHigh} mS/cm, dormancy trigger ${params.thresholds.dormancySoilTempC}°C soil temp.

Evidence (JSON, computed deterministically from real sensor readings -- treat every field as verified fact, do not contradict it or recompute it yourself):
${JSON.stringify(evidence, null, 2)}

${stalenessNote(evidence.readingAgeHours)}
${trendNote(evidence.daysOfHistory)}
${evidence.sensorQualityWarnings.join(' ')}

"mirroredStatus" above is GroveIQ's own deterministic threshold/trend verdict -- the same one driving the app's status badges. Use it as a grounding fact, not something to second-guess, but you don't have to just restate it: add texture the raw badge can't (dry-down rate, a detected watering event, EC/temp anomalies, weather context, companion-tree comparison) when the evidence supports it.

Write a plain-language synthesis a bonsai grower would find useful. Be specific about what the numbers show, and don't invent a cause (e.g. "likely due to heat") unless the weather evidence actually supports it. If nothing is concerning, say so plainly rather than manufacturing a caveat. Set "confidence" based on how well the evidence supports your synthesis -- low if history is thin or data is stale/missing, high if the evidence is clean and consistent.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"status": "ok" | "watch" | "urgent", "confidence": "low" | "medium" | "high", "summary": "<one sentence, plain language>", "detail": "<2-4 sentences>"}`;

  return callClaudeForDiagnosis(env, prompt);
}
