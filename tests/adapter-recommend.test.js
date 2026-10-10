import test from 'node:test';
import assert from 'node:assert/strict';
import { QlooAdapter } from '../src/qloo/qloo-adapter.js';

test('QlooAdapter recommend: rejects missing target_type or signals', async () => {
  const adapter = new QlooAdapter();
  const resNoType = await adapter.recommend({ target_type: '' });
  assert.equal(resNoType.status, 'error');

  const resNoSignal = await adapter.recommend({ target_type: 'place' });
  assert.equal(resNoSignal.status, 'needs_input');
});

test('QlooAdapter recommend: normalizes entities, properties, and affinities', async () => {
  const mockExecutor = {
    async execute(op, input) {
      assert.equal(op, 'recommend');
      return {
        operation: 'recommend',
        durationMs: 50,
        result: {
          status: 'ok',
          results: [
            {
              entity_id: 'place-123',
              name: 'Cultural Art Cafe',
              type: 'urn:entity',
              subtype: 'urn:entity:place',
              affinity: 0.94,
              popularity: 0.88,
              properties: {
                address: 'Victoria Island, Lagos',
                business_rating: 4.5
              }
            }
          ],
          provenance: { source: 'Qloo API', endpoint: '/v2/insights' }
        }
      };
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.recommend({
    target_type: 'place',
    signal_tags: ['urn:tag:cuisine:qloo:coffee']
  });

  assert.equal(res.status, 'ok');
  assert.equal(res.workflow, 'recommend');
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].name, 'Cultural Art Cafe');
  assert.equal(res.results[0].affinity, 0.94);
  assert.equal(res.results[0].properties.address, 'Victoria Island, Lagos');
});

test('QlooAdapter recommend: live Qloo query returns authentic cross-domain recommendations', async () => {
  const adapter = new QlooAdapter();
  const res = await adapter.recommend({
    target_type: 'artist',
    signal_tags: ['urn:tag:genre:music:indie_rock'],
    limit: 2
  });

  assert.equal(res.status, 'ok');
  assert.ok(res.results.length > 0);
  assert.ok(res.results[0].entity_id.length > 5);
  assert.ok(typeof res.results[0].affinity === 'number');
  assert.equal(res.provenance.source, 'Qloo API');
});
