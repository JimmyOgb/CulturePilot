import test from 'node:test';
import assert from 'node:assert/strict';
import { QlooAdapter } from '../src/qloo/qloo-adapter.js';

test('Malformed Response: handles corrupt or unexpected Qloo result object', async () => {
  const mockExecutor = {
    async execute() {
      // Simulate non-standard response
      return {
        operation: 'find_tags',
        result: {
          status: 'ok',
          results: 'not-an-array-corrupted-data'
        }
      };
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.findTags({ query: 'art' });

  assert.equal(res.status, 'empty');
  assert.equal(Array.isArray(res.results), true);
  assert.equal(res.results.length, 0);
});

test('Malformed Response: handles missing result envelope gracefully', async () => {
  const mockExecutor = {
    async execute() {
      return {};
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.recommend({
    target_type: 'place',
    signal_tags: ['urn:tag:cuisine:qloo:coffee']
  });

  assert.equal(res.status, 'empty');
  assert.equal(Array.isArray(res.results), true);
});
