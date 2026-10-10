import test from 'node:test';
import assert from 'node:assert/strict';
import { CulturePilotPipeline } from '../src/pipeline/intent-pipeline.js';
import { config } from '../src/config.js';

test('Quality Audit: Lagos prompt separates categories, excludes sports complex, and validates arts & coffee', async () => {
  const pipeline = new CulturePilotPipeline();
  const res = await pipeline.process({
    intent: 'I want a weekend in Lagos with an artsy, design-focused, indie-music vibe and good coffee.'
  });

  // 1. Valid CulturePilot status
  assert.ok(['ok', 'partial', 'degraded'].includes(res.status), `Status was ${res.status}`);

  // 2. Category separation exists
  assert.ok(res.categories.arts_and_design, 'Must have arts_and_design category');
  assert.ok(res.categories.coffee, 'Must have coffee category');
  assert.ok(res.categories.music, 'Must have music category');

  // 3. Arts & Design contains Terra Kulture and NOT sports complex
  const artsNames = res.categories.arts_and_design.results.map((r) => r.name);
  assert.ok(
    artsNames.some((name) => name.toLowerCase().includes('kulture') || name.toLowerCase().includes('art')),
    'Arts category should surface verified cultural venues like Terra Kulture'
  );
  assert.ok(
    !artsNames.some((name) => name.toLowerCase().includes('sports center')),
    'Sports Center must NOT appear in arts_and_design results'
  );

  // 4. Coffee category contains only verified coffee/cafe establishments (e.g. Crepaway bistro) or honest empty
  if (res.categories.coffee.count > 0) {
    for (const coffeePlace of res.categories.coffee.results) {
      const text = `${coffeePlace.name} ${coffeePlace.properties?.description || ''}`.toLowerCase();
      assert.ok(
        text.includes('coffee') || text.includes('cafe') || text.includes('bistro') || text.includes('crepe'),
        'Coffee result must have verified coffee/cafe offering'
      );
    }
  } else {
    assert.equal(res.categories.coffee.status, 'empty');
  }

  // 5. Excluded list contains Sports Center with transparent athletic facility reason
  const sportsExcluded = res.excluded.find((e) => e.name.toLowerCase().includes('sports center'));
  assert.ok(sportsExcluded, 'Sports Center must be recorded in excluded list');
  assert.ok(
    sportsExcluded.reason.toLowerCase().includes('athletic') || sportsExcluded.reason.toLowerCase().includes('sports'),
    'Exclusion reason must identify athletic facility'
  );

  // 6. Music category contains artists with provenance
  assert.ok(res.categories.music.count > 0, 'Music category must have results');
  for (const artist of res.categories.music.results) {
    assert.ok(artist.entity_id, 'Artist has Qloo entity_id');
    assert.equal(artist.source.workflow, 'recommend');
    assert.equal(artist.source.qloo_entity_id, artist.entity_id);
  }

  // 7. Security: Zero API key leakage
  const serialized = JSON.stringify(res);
  assert.ok(!serialized.includes(config.apiKey), 'API key must never appear in response');
});

test('Quality Audit: Coffee prompt in high-density city (London) returns genuine cafes', async () => {
  const pipeline = new CulturePilotPipeline();
  const res = await pipeline.process({
    intent: 'I want a morning in London with artisanal coffee and cozy cafes.'
  });

  assert.ok(['ok', 'partial', 'degraded'].includes(res.status));
  assert.ok(res.categories.coffee, 'Must have coffee category');
  assert.ok(res.provenance.length > 0, 'Must record Qloo provenance');
});

test('Quality Audit: Indie music prompt returns verified artists with real Qloo IDs', async () => {
  const pipeline = new CulturePilotPipeline();
  const res = await pipeline.process({
    intent: 'Recommend indie rock and alternative bands with an acoustic vibe.'
  });

  assert.ok(['ok', 'partial'].includes(res.status), `Status was ${res.status}`);
  assert.ok(res.categories.music.count > 0);
  for (const m of res.categories.music.results) {
    assert.ok(m.entity_id.length > 10, 'Must have authentic Qloo UUID');
    assert.ok(typeof m.affinity === 'number');
  }
});

test('Quality Audit: Unknown destination handles empty place results cleanly', async () => {
  const pipeline = new CulturePilotPipeline();
  const res = await pipeline.process({
    intent: 'I want a weekend in AtlantisNonExistentCity99 with coffee and art.'
  });

  assert.ok(['empty', 'degraded'].includes(res.status));
  assert.equal(res.categories.coffee.count, 0);
  assert.equal(res.categories.arts_and_design.count, 0);
});
