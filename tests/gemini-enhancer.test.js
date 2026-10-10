import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGeminiClient, isGeminiAvailable, synthesizeCulturalSummary } from '../src/gemini/gemini-client.js';

test('Gemini Client: returns null and isGeminiAvailable is false when key is unset', () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origGoogleKey = process.env.GOOGLE_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    assert.equal(isGeminiAvailable(), false);
    assert.equal(getGeminiClient(), null);
  } finally {
    if (origKey) process.env.GEMINI_API_KEY = origKey;
    if (origGoogleKey) process.env.GOOGLE_API_KEY = origGoogleKey;
  }
});

test('Gemini Client: synthesizeCulturalSummary degrades safely to null without errors', async () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origGoogleKey = process.env.GOOGLE_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const result = await synthesizeCulturalSummary({
      intent: 'I want a weekend in Lagos with artsy vibe and good coffee',
      categories: {
        arts_and_design: [{ name: 'Terra Kulture' }],
        coffee: [],
        music: [{ name: 'Janelle Monáe' }]
      }
    });

    assert.equal(result, null);
  } finally {
    if (origKey) process.env.GEMINI_API_KEY = origKey;
    if (origGoogleKey) process.env.GOOGLE_API_KEY = origGoogleKey;
  }
});
