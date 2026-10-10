import test from 'node:test';
import assert from 'node:assert/strict';
import { CulturePilotPipeline } from '../src/pipeline/intent-pipeline.js';

test('Provenance: every generated result includes explicit source provenance', async () => {
  const mockAdapter = {
    async findTags() {
      return {
        status: 'ok',
        results: [{ id: 'urn:tag:cuisine:coffee', name: 'Coffee', type: 'urn:tag:cuisine' }],
        provenance: { source: 'Qloo API', endpoint: '/v2/tags' }
      };
    },
    async recommend(params) {
      if (params.target_type === 'place') {
        return {
          status: 'ok',
          results: [
            {
              entity_id: '5C540015-284E-42BF-A27C-B46DC6F30FA0',
              name: 'Royal Coffee & Bistro',
              type: 'urn:entity:place',
              affinity: 0.76,
              properties: {
                description: 'Specialty cafe and coffee bistro in Victoria Island.',
                address: 'Lagos, Nigeria'
              }
            }
          ],
          provenance: { source: 'Qloo API', endpoint: '/v2/insights' }
        };
      }
      return {
        status: 'ok',
        results: [
          {
            entity_id: '4A322BDD-04A3-4369-8234-B38A7FB485D9',
            name: 'Burna Boy',
            type: 'urn:entity:artist',
            affinity: 0.95,
            properties: {}
          }
        ],
        provenance: { source: 'Qloo API', endpoint: '/v2/insights' }
      };
    }
  };

  const pipeline = new CulturePilotPipeline({ adapter: mockAdapter });
  const response = await pipeline.process({
    intent: 'I want a weekend in Lagos with good coffee and music.'
  });

  assert.equal(response.status, 'ok');
  assert.ok(response.results.length >= 2);

  for (const item of response.results) {
    assert.ok(item.name, 'Result must have a name');
    assert.ok(item.type, 'Result must have a type');
    assert.ok(item.entity_id, 'Result must have an entity_id');
    assert.ok(item.reason, 'Result must have a reason explanation');
    assert.ok(item.source, 'Result must have a source provenance');
    assert.equal(item.source.workflow, 'recommend');
    assert.equal(item.source.qloo_entity_id, item.entity_id);
  }

  assert.ok(response.provenance.length >= 2, 'Must include aggregate API provenance');
  assert.equal(response.provenance[0].source, 'Qloo API');
});
