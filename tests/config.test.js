import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, redactSecrets, config } from '../src/config.js';

test('Config: validates presence of QLOO_API_KEY and base URL', () => {
  const result = validateConfig();
  assert.equal(typeof result.valid, 'boolean');
  assert.equal(typeof result.configured.hasKey, 'boolean');
  assert.ok(result.configured.hasKey, 'QLOO_API_KEY must be detected');
  assert.ok(result.configured.baseUrl.startsWith('https://'), 'Base URL must be HTTPS');
});

test('Config: server-side config exposes apiKey securely without logging it', () => {
  assert.ok(config.isKeyPresent, 'API key is marked present');
  assert.ok(config.apiKey.length > 10, 'API key is non-empty string');
});

test('Config: redactSecrets removes API key from strings', () => {
  const secret = config.apiKey;
  const input = `Request failed using key: ${secret} at endpoint`;
  const sanitized = redactSecrets(input);

  assert.ok(!sanitized.includes(secret), 'Secret key must be redacted');
  assert.ok(sanitized.includes('[REDACTED_API_KEY]'), 'Redaction placeholder must be present');
});

test('Config: redactSecrets removes sensitive fields from objects', () => {
  const payload = {
    user: 'cultural_explorer',
    api_key: config.apiKey,
    nested: {
      Authorization: 'Bearer test-token',
      data: `Using ${config.apiKey}`
    }
  };

  const sanitized = redactSecrets(payload);
  assert.equal(sanitized.api_key, '[REDACTED_SECRET]');
  assert.equal(sanitized.nested.Authorization, '[REDACTED_SECRET]');
  assert.ok(!JSON.stringify(sanitized).includes(config.apiKey));
});
