import test from 'node:test';
import assert from 'node:assert/strict';
import cultureHandler from '../api/culture.js';
import healthHandler from '../api/health.js';

function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) {
      res.statusCode = code;
      Object.assign(res.headers, headers);
      return res;
    },
    end(data) {
      res.body = data;
    }
  };
  return res;
}

test('Vercel API: GET /api/health handler returns valid JSON readiness', async () => {
  const req = { method: 'GET' };
  const res = createMockRes();

  await healthHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/json');
  const parsed = JSON.parse(res.body);
  assert.ok(['ok', 'degraded'].includes(parsed.status));
  assert.ok(typeof parsed.qloo_configured === 'boolean');
});

test('Vercel API: OPTIONS /api/culture handles CORS preflight', async () => {
  const req = { method: 'OPTIONS' };
  const res = createMockRes();

  await cultureHandler(req, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('Vercel API: GET /api/culture rejects non-POST methods with 405', async () => {
  const req = { method: 'GET' };
  const res = createMockRes();

  await cultureHandler(req, res);

  assert.equal(res.statusCode, 405);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.status, 'error');
});

test('Vercel API: POST /api/culture processes pre-parsed req.body correctly', async () => {
  const req = {
    method: 'POST',
    body: { intent: '' }
  };
  const res = createMockRes();

  await cultureHandler(req, res);

  assert.equal(res.statusCode, 200);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.status, 'needs_input');
});
