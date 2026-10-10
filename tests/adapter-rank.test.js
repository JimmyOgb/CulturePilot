import test from 'node:test';
import assert from 'node:assert/strict';
import { QlooAdapter } from '../src/qloo/qloo-adapter.js';

test('QlooAdapter rank: validates required fields', async () => {
  const adapter = new QlooAdapter();
  const resNoType = await adapter.rank({ option_type: '' });
  assert.equal(resNoType.status, 'error');

  const resNoOptions = await adapter.rank({ option_type: 'artist', options: [] });
  assert.equal(resNoOptions.status, 'error');

  const resNoSignal = await adapter.rank({ option_type: 'artist', options: ['id-1'] });
  assert.equal(resNoSignal.status, 'needs_input');
});

test('QlooAdapter rank: normalizes ranked output ordering', async () => {
  const mockExecutor = {
    async execute(op, input) {
      assert.equal(op, 'rank');
      return {
        operation: 'rank',
        durationMs: 45,
        result: {
          status: 'ok',
          results: [
            {
              entity_id: '4287463B-79BD-4EB6-9A0C-51855AE21CD0',
              name: 'TV on the Radio',
              affinity: 0.96,
              popularity: 0.99
            },
            {
              entity_id: '47E7E04C-7D19-48D8-B771-73AEC4430765',
              name: 'Modest Mouse',
              affinity: 0.93,
              popularity: 0.99
            }
          ],
          provenance: { source: 'Qloo API', endpoint: '/v2/insights' }
        }
      };
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.rank({
    option_type: 'artist',
    options: ['4287463B-79BD-4EB6-9A0C-51855AE21CD0', '47E7E04C-7D19-48D8-B771-73AEC4430765'],
    signals: ['37EF1DD2-6B9D-4F56-968B-54C1D2A44188']
  });

  assert.equal(res.status, 'ok');
  assert.equal(res.workflow, 'rank');
  assert.equal(res.results.length, 2);
  assert.equal(res.results[0].rank, 1);
  assert.equal(res.results[0].name, 'TV on the Radio');
  assert.equal(res.results[1].rank, 2);
  assert.equal(res.results[1].name, 'Modest Mouse');
});
