import test from 'node:test';
import assert from 'node:assert/strict';
import { QlooAdapter } from '../src/qloo/qloo-adapter.js';

test('QlooAdapter find_tags: rejects missing or empty query with error status', async () => {
  const adapter = new QlooAdapter();
  const resEmpty = await adapter.findTags({ query: '' });
  assert.equal(resEmpty.status, 'error');
  assert.equal(resEmpty.error.code, 'INVALID_INPUT');

  const resNull = await adapter.findTags(null);
  assert.equal(resNull.status, 'error');
  assert.equal(resNull.error.code, 'INVALID_INPUT');
});

test('QlooAdapter find_tags: normalizes response and preserves Qloo URNs', async () => {
  // Test with mock executor to ensure deterministic normalization contract
  const mockExecutor = {
    async execute(op, input) {
      assert.equal(op, 'find_tags');
      return {
        operation: 'find_tags',
        durationMs: 42,
        correlationId: 'test-corr-1',
        result: {
          status: 'ok',
          results: [
            {
              id: 'urn:tag:genre:music:indie_rock',
              name: 'indie rock',
              type: 'urn:tag:genre:music',
              popularity: 0.99
            }
          ],
          provenance: { source: 'Qloo API', endpoint: '/v2/tags' }
        }
      };
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.findTags({ query: 'indie rock', limit: 1 });

  assert.equal(res.status, 'ok');
  assert.equal(res.workflow, 'find_tags');
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].id, 'urn:tag:genre:music:indie_rock');
  assert.equal(res.results[0].type, 'urn:tag:genre:music');
  assert.equal(res.results[0].name, 'indie rock');
  assert.equal(res.provenance.endpoint, '/v2/tags');
});

test('QlooAdapter find_tags: live integration test returns real Qloo tags', async () => {
  const adapter = new QlooAdapter();
  const res = await adapter.findTags({ query: 'jazz', limit: 2 });

  assert.equal(res.status, 'ok');
  assert.ok(res.results.length > 0, 'Must return at least one tag');
  assert.ok(res.results[0].id.startsWith('urn:tag:'), 'Preserves real Qloo tag URN');
  assert.ok(res.provenance.source === 'Qloo API');
});
