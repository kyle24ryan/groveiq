import type { Env } from './env';

// GUARDRAIL — read before adding a daily/per-tree diagnostic function here:
//
// UPDATE 2026-08-18: WH51 soil sensors are now physically installed (5
// channels, mapped to real trees in src/soilChannels.ts) and
// src/ecowitt.ts's 5-min cron writes real per-tree soil_readings rows.
// The original condition below is satisfied for the *backend* -- but
// don't build the diagnostic function yet without also checking:
// frontend/src/data/mockData.ts's dailyReadingsFor()/analyzeTree()/
// insightFor() are still 100% synthetic and still drive every chart on
// Trees/TreeDetail/Timeline/Grove. If a diagnostic function here reads
// real soil_readings while the UI still renders mock data next to it,
// that's a *worse* trust failure than the original one -- a real AI
// verdict sitting beside a fake chart that visually contradicts it, with
// no way for the user to tell which is which. Wire the frontend off
// mock data (or at minimum onto GET /api/v1/trees/:id/soil-readings,
// added 2026-08-18) in the same pass as building this, not after.
//
// Original guardrail, still the core rule: do NOT send per-tree
// soil_readings (moisture/EC/temp) to the Anthropic API, or write output
// into `analyses` as if it were a real diagnosis, for any tree whose
// soil_readings is still synthetic. A "daily diagnostic" built against
// fake numbers would be Claude confidently diagnosing a fake tree,
// indistinguishable in the UI from a real diagnosis -- the exact trust
// failure the Ecowitt UI audit (2026-08) flagged and this codebase spent
// real effort fixing.
//
// analyzeTreePhoto() below is fine as-is: it sends a real uploaded photo,
// not synthetic sensor readings, and the vision model itself can (and does)
// recognize when an image isn't a real tree rather than hallucinating a
// diagnosis. Sensor-based diagnostics don't have that same self-check.
//
// See CHECKLIST.md "Phase 2" for current status.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const VISION_MODEL = 'claude-sonnet-5';

export type VisionAnalysis = {
  status: 'ok' | 'watch' | 'urgent';
  summary: string;
  detail: string;
};

export async function analyzeTreePhoto(
  env: Env,
  params: { imageBase64: string; mediaType: string; treeName: string; species: string; speciesNotes?: string }
): Promise<VisionAnalysis> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = `You are Sensei, GroveIQ's bonsai health advisor. Examine this photo of "${params.treeName}" (${params.species}) for signs of pest damage, disease, discoloration, wilting, or other health concerns.
${params.speciesNotes ? `\nSpecies-specific context: ${params.speciesNotes}` : ''}

Distinguish what you directly observe in the image from what you're inferring. Don't overstate certainty from a single photo. If the species is a normal deciduous conifer and needle color looks seasonal rather than diseased, say so rather than flagging it.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"status": "ok" | "watch" | "urgent", "summary": "<one sentence, plain language>", "detail": "<2-4 sentences: what you observed, whether it's concerning, and why>"}`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: params.mediaType, data: params.imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API returned ${response.status}: ${errText}`);
  }

  const body = (await response.json()) as { content: { type: string; text?: string }[]; stop_reason?: string };
  const textBlock = body.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No text content in vision analysis response');
  }

  const jsonText = textBlock.text
    .trim()
    .replace(/^```(json)?\n?/, '')
    .replace(/```$/, '')
    .trim();

  let parsed: VisionAnalysis;
  try {
    parsed = JSON.parse(jsonText) as VisionAnalysis;
  } catch {
    const truncated = body.stop_reason === 'max_tokens' ? ' (response was cut off at max_tokens)' : '';
    throw new Error(`Vision response wasn't valid JSON${truncated}: ${jsonText.slice(0, 200)}`);
  }

  if (!['ok', 'watch', 'urgent'].includes(parsed.status) || !parsed.summary || !parsed.detail) {
    throw new Error(`Vision response missing required fields: ${jsonText.slice(0, 200)}`);
  }

  return parsed;
}
