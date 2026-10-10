import test from 'node:test';
import assert from 'node:assert/strict';
import { QlooAdapter } from '../src/qloo/qloo-adapter.js';

test('QlooAdapter describe: rejects missing or empty entity', async () => {
  const adapter = new QlooAdapter();
  const resEmpty = await adapter.describe({ entity: '' });
  assert.equal(resEmpty.status, 'error');
  assert.equal(resEmpty.error.code, 'INVALID_INPUT');
});

test('QlooAdapter describe: normalizes entity profile and preserves IDs', async () => {
  const mockExecutor = {
    async execute(op, input) {
      assert.equal(op, 'describe');
      return {
        operation: 'describe',
        durationMs: 35,
        correlationId: 'test-corr-2',
        result: {
          status: 'ok',
          results: [
            {
              entity_id: '4A322BDD-04A3-4369-8234-B38A7FB485D9',
              name: 'Burna Boy',
              type: 'urn:entity:artist',
              popularity: 0.96
            }
          ],
          provenance: { source: 'Qloo API', endpoint: '/entities' }
        }
      };
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.describe({ entity: '4A322BDD-04A3-4369-8234-B38A7FB485D9' });

  assert.equal(res.status, 'ok');
  assert.equal(res.workflow, 'describe');
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].entity_id, '4A322BDD-04A3-4369-8234-B38A7FB485D9');
  assert.equal(res.results[0].name, 'Burna Boy');
  assert.equal(res.results[0].type, 'urn:entity:artist');
});

test('QlooAdapter describe: handles ambiguous entities returning needs_input', async () => {
  const mockExecutor = {
    async execute() {
      return {
        operation: 'describe',
        result: {
          status: 'needs_input',
          results: [],
          resolution: {
            issues: [{ input: 'Burna Boy', kind: 'ambiguous', candidates: [{ id: '1' }, { id: '2' }] }]
          }
        }
      };
    }
  };

  const adapter = new QlooAdapter({ executor: mockExecutor });
  const res = await adapter.describe({ entity: 'Burna Boy' });
  assert.equal(res.status, 'needs_input');
  assert.ok(res.resolution.issues.length > 0);
});
