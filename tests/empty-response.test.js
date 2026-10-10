import test from 'node:test';
import assert from 'node:assert/strict';
import { QlooAdapter } from '../src/qloo/qloo-adapter.js';

test('Empty Response: handles empty tag list without fabricating items', async () => {
  const mockExecutor = {
    async execute() {
      return {
        operation: 'find_tags',
        result: {
          status: 'ok',
          results: [],
          provenance: { source: 'Qloo API', endpoint: '/v2/tags' }
        }
      };
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.findTags({ query: 'nonexistent_cultural_concept_xyz_123' });

  assert.equal(res.status, 'empty');
  assert.equal(res.results.length, 0);
  assert.equal(res.result_count, 0);
});

test('Empty Response: handles empty recommendations without fabricating items', async () => {
  const mockExecutor = {
    async execute() {
      return {
        operation: 'recommend',
        result: {
          status: 'ok',
          results: [],
          provenance: { source: 'Qloo API', endpoint: '/v2/insights' }
        }
      };
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.recommend({
    target_type: 'place',
    filter_location: 'NowhereLand123',
    signal_tags: ['urn:tag:cuisine:qloo:coffee']
  });

  assert.equal(res.status, 'empty');
  assert.equal(res.results.length, 0);
  assert.equal(res.result_count, 0);
});
