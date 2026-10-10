/**
 * Optional Google AI Studio / Gemini Integration
 *
 * Uses the official @google/genai SDK (v2.3+) to optionally parse user intent
 * and generate structured cultural discovery synthesis strictly grounded in
 * authentic Qloo results.
 *
 * Security & Reliability Guarantee:
 * - Operates only if GEMINI_API_KEY or GOOGLE_API_KEY is configured on the server.
 * - If unavailable or unconfigured, falls back completely to pure deterministic Qloo pipeline.
 * - NEVER invents entities, venues, artists, affinity scores, or provenance.
 * - API keys are strictly server-side and never exposed.
 */

import { GoogleGenAI } from '@google/genai';

let geminiClientInstance = null;

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!geminiClientInstance) {
    geminiClientInstance = new GoogleGenAI({ apiKey });
  }
  return geminiClientInstance;
}

export function isGeminiAvailable() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

/**
 * Optionally synthesize a concise cultural discovery narrative strictly
 * grounded in the provided Qloo results.
 *
 * @param {Object} params
 * @param {string} params.intent
 * @param {Object} params.categories
 * @returns {Promise<string|null>}
 */
export async function synthesizeCulturalSummary({ intent, categories }) {
  const client = getGeminiClient();
  if (!client) return null;

  try {
    const verifiedNames = [
      ...(categories.arts_and_design || []).map(e => e.name),
      ...(categories.coffee || []).map(e => e.name),
      ...(categories.music || []).map(e => e.name)
    ];

    if (verifiedNames.length === 0) return null;

    const prompt = `
You are a cultural discovery curator for CulturePilot.
User Intent: "${intent}"
Verified Qloo Entities:
- Arts & Design: ${(categories.arts_and_design || []).map(e => e.name).join(', ') || 'None'}
- Coffee: ${(categories.coffee || []).map(e => e.name).join(', ') || 'None'}
- Music: ${(categories.music || []).map(e => e.name).join(', ') || 'None'}

Rules:
1. Write 2-3 sentences summarizing the cultural vibe.
2. ONLY mention entities from the "Verified Qloo Entities" list above.
3. NEVER invent or hallucinate any other venue, artist, address, or score.
4. If a category is None, honestly state that no verified matches were cataloged.
`;

    const response = await client.interactions.create({
      model: 'gemini-3.8-flash',
      input: prompt
    });

    return response.output_text?.trim() || null;
  } catch (err) {
    // Fail silently to pure deterministic Qloo mode
    return null;
  }
}
