import type { Env } from './env';

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
      max_tokens: 500,
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

  const body = (await response.json()) as { content: { type: string; text?: string }[] };
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
    throw new Error(`Vision response wasn't valid JSON: ${jsonText.slice(0, 200)}`);
  }

  if (!['ok', 'watch', 'urgent'].includes(parsed.status) || !parsed.summary || !parsed.detail) {
    throw new Error(`Vision response missing required fields: ${jsonText.slice(0, 200)}`);
  }

  return parsed;
}
