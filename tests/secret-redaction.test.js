import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets, config } from '../src/config.js';

test('Secret Redaction: completely purges key from error messages and logs', () => {
  const testKey = config.apiKey;
  const errorMsg = `Error 401 Unauthorized: Invalid key ${testKey} provided to https://hackathon.api.qloo.com`;
  const sanitized = redactSecrets(errorMsg);

  assert.ok(!sanitized.includes(testKey));
  assert.ok(sanitized.includes('[REDACTED_API_KEY]'));
});

test('Secret Redaction: handles null, undefined, and non-string primitives safely', () => {
  assert.equal(redactSecrets(null), null);
  assert.equal(redactSecrets(undefined), undefined);
  assert.equal(redactSecrets(12345), 12345);
  assert.equal(redactSecrets(true), true);
});

test('Secret Redaction: scrubs deep arrays and nested structures', () => {
  const testKey = config.apiKey;
  const complex = [
    { key: testKey, label: 'sample' },
    [`nested ${testKey}`, { apiKey: 'private' }]
  ];

  const sanitized = redactSecrets(complex);
  const serialized = JSON.stringify(sanitized);

  assert.ok(!serialized.includes(testKey));
  assert.ok(serialized.includes('[REDACTED_API_KEY]'));
  assert.ok(serialized.includes('[REDACTED_SECRET]'));
});
