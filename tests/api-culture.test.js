import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { config } from '../src/config.js';

let server;
let baseUrl;

test.before(async () => {
  server = createServer();
  await new Promise((resolve) => {
    // Listen on port 0 to choose an open ephemeral port
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('API: GET /api/health reports readiness without exposing secrets', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'ok');
  assert.equal(json.qloo_configured, true);
  assert.ok(!JSON.stringify(json).includes(config.apiKey));
});

test('API: POST /api/culture handles empty intent returning needs_input', async () => {
  const res = await fetch(`${baseUrl}/api/culture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: '' })
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'needs_input');
  assert.ok(json.warnings.length > 0);
  assert.equal(json.results.length, 0);
});

test('API: POST /api/culture sanitizes PII and generates privacy warning', async () => {
  const piiIntent = 'My name is Alice Smith, email me at alice@example.com or call 555-123-4567. I want a weekend in Lagos with good coffee.';
  const res = await fetch(`${baseUrl}/api/culture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: piiIntent })
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(!json.intent.includes('alice@example.com'), 'Email must be scrubbed');
  assert.ok(!json.intent.includes('555-123-4567'), 'Phone number must be scrubbed');
  assert.ok(json.warnings.some((w) => w.toLowerCase().includes('email') || w.toLowerCase().includes('personal')));
});

test('API: POST /api/culture processes valid cultural request with zero secret leakage', async () => {
  const res = await fetch(`${baseUrl}/api/culture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'I want a weekend in Lagos with an artsy, design-focused, indie-music vibe and good coffee.'
    })
  });

  assert.equal(res.status, 200);
  const json = await res.json();

  // Validate stable response shape
  assert.ok(['ok', 'partial', 'degraded'].includes(json.status), `Status was ${json.status}`);
  assert.ok(Array.isArray(json.results), 'results must be an array');
  assert.ok(Array.isArray(json.connections), 'connections must be an array');
  assert.ok(Array.isArray(json.provenance), 'provenance must be an array');
  assert.ok(Array.isArray(json.warnings), 'warnings must be an array');

  // Verify secret redaction
  const serialized = JSON.stringify(json);
  assert.ok(!serialized.includes(config.apiKey), 'API key must never appear in response payload');

  // Verify real results and provenance
  if (json.results.length > 0) {
    const first = json.results[0];
    assert.ok(first.name, 'Result has name');
    assert.ok(first.entity_id, 'Result has entity_id');
    assert.ok(first.source, 'Result has provenance source');
  }
});
