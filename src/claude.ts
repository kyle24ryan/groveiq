import type { Env } from './env';

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
  summary: string;
  detail: string;
};

async function callClaudeForDiagnosis(env: Env, content: unknown): Promise<Diagnosis> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
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
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API returned ${response.status}: ${errText}`);
  }

  const body = (await response.json()) as { content: { type: string; text?: string }[]; stop_reason?: string };
  const textBlock = body.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No text content in analysis response');
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
    throw new Error(`Response wasn't valid JSON${truncated}: ${jsonText.slice(0, 200)}`);
  }

  if (!['ok', 'watch', 'urgent'].includes(parsed.status) || !parsed.summary || !parsed.detail) {
    throw new Error(`Response missing required fields: ${jsonText.slice(0, 200)}`);
  }

  return parsed;
}

export async function analyzeTreePhoto(
  env: Env,
  params: { imageBase64: string; mediaType: string; treeName: string; species: string; speciesNotes?: string }
): Promise<Diagnosis> {
  const prompt = `You are Sensei, GroveIQ's bonsai health advisor. Examine this photo of "${params.treeName}" (${params.species}) for signs of pest damage, disease, discoloration, wilting, or other health concerns.
${params.speciesNotes ? `\nSpecies-specific context: ${params.speciesNotes}` : ''}

Distinguish what you directly observe in the image from what you're inferring. Don't overstate certainty from a single photo. If the species is a normal deciduous conifer and needle color looks seasonal rather than diseased, say so rather than flagging it.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"status": "ok" | "watch" | "urgent", "summary": "<one sentence, plain language>", "detail": "<2-4 sentences: what you observed, whether it's concerning, and why>"}`;

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
  latestSoil: { moisturePct: number | null; tempC: number | null; ec: number | null; ts: string };
  readingAgeHours: number;
  thresholds: { moistureLow: number; moistureHigh: number; ecHigh: number; dormancySoilTempC: number };
  dailyHistory: { date: string; moisturePct: number }[]; // oldest first
  outdoorConditions?: { tempC: number; humidityPct: number | null };
};

// Same minimum-history threshold as the frontend's rule-based engine
// (frontend/src/data/realTreeAnalysis.ts's MIN_DAYS_FOR_TREND) -- kept in
// sync by convention, not by import, since this runs in a separate
// package (backend Worker vs. frontend bundle).
export const MIN_DAYS_FOR_TREND = 3;
const STALE_READING_HOURS = 1;

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

export async function diagnoseTreeSensorData(env: Env, params: SensorDiagnosisParams): Promise<Diagnosis> {
  const historyLines =
    params.dailyHistory.length > 0 ? params.dailyHistory.map((d) => `${d.date}: ${d.moisturePct}%`).join('\n') : '(no daily history yet)';

  const prompt = `You are Sensei, GroveIQ's bonsai health advisor. Review this tree's real soil sensor data and write a short, honest daily diagnostic.

Tree: ${params.treeName} (${params.species}, ${params.developmentStage} stage)
${params.speciesNotes ? `Species notes: ${params.speciesNotes}\n` : ''}
Current reading (${params.latestSoil.ts}): soil moisture ${params.latestSoil.moisturePct ?? 'unknown'}%, EC ${params.latestSoil.ec ?? 'unknown'} mS/cm, soil temp ${params.latestSoil.tempC ?? 'unknown'}°C.
${stalenessNote(params.readingAgeHours)}

Configured thresholds (PROVISIONAL -- not yet calibrated per-sensor; this Ecowitt probe reports a substrate-dependent moisture index, not a universal soil-water percentage, so a reading outside these is worth mentioning, not certain fact): moisture ${params.thresholds.moistureLow}-${params.thresholds.moistureHigh}%, EC ceiling ${params.thresholds.ecHigh} mS/cm, dormancy trigger ${params.thresholds.dormancySoilTempC}°C soil temp.

Daily moisture history (${params.dailyHistory.length} day(s), oldest first):
${historyLines}
${trendNote(params.dailyHistory.length)}
${params.outdoorConditions ? `\nCurrent outdoor conditions: ${params.outdoorConditions.tempC}°C${params.outdoorConditions.humidityPct != null ? `, ${params.outdoorConditions.humidityPct}% humidity` : ''}.` : ''}

Write a plain-language synthesis a bonsai grower would find useful. Be specific about what the numbers show, don't just restate a threshold check, and don't invent a cause (e.g. "likely due to heat") unless the outdoor conditions actually support it. If nothing is concerning, say so plainly rather than manufacturing a caveat.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"status": "ok" | "watch" | "urgent", "summary": "<one sentence, plain language>", "detail": "<2-4 sentences>"}`;

  return callClaudeForDiagnosis(env, prompt);
}
