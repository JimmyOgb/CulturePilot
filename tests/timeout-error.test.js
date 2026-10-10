import test from 'node:test';
import assert from 'node:assert/strict';
import { QlooAdapter } from '../src/qloo/qloo-adapter.js';
import { config } from '../src/config.js';

test('Timeout & Error: maps timeout failure to QLOO_TIMEOUT with retryable flag', async () => {
  const mockExecutor = {
    async execute() {
      const err = new Error('Request timed out after 20000ms');
      err.code = 'QLOO_TIMEOUT';
      err.retryable = true;
      throw err;
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.findTags({ query: 'indie' });

  assert.equal(res.status, 'error');
  assert.equal(res.error.code, 'QLOO_TIMEOUT');
  assert.equal(res.error.retryable, true);
});

test('Timeout & Error: maps 429 rate limit to QLOO_RATE_LIMIT', async () => {
  const mockExecutor = {
    async execute() {
      const err = new Error('HTTP 429: Too Many Requests');
      err.code = 'QLOO_RATE_LIMIT';
      err.retryable = true;
      throw err;
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.recommend({
    target_type: 'artist',
    signal_tags: ['urn:tag:test']
  });

  assert.equal(res.status, 'error');
  assert.equal(res.error.code, 'QLOO_RATE_LIMIT');
  assert.equal(res.error.retryable, true);
});

test('Timeout & Error: redacts API key if present in error message', async () => {
  const mockExecutor = {
    async execute() {
      throw new Error(`Unauthorized connection with token ${config.apiKey}`);
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.findTags({ query: 'art' });

  assert.equal(res.status, 'error');
  assert.ok(!res.error.message.includes(config.apiKey));
  assert.ok(res.error.message.includes('[REDACTED_API_KEY]'));
});
