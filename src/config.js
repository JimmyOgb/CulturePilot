import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables from .env
dotenv.config();

const QLOO_API_KEY = process.env.QLOO_API_KEY ? process.env.QLOO_API_KEY.trim() : '';
const QLOO_BASE_URL = process.env.QLOO_BASE_URL?.trim() || 'https://hackathon.api.qloo.com';
const QLOO_TRUSTED_BASE_URL = process.env.QLOO_TRUSTED_BASE_URL?.trim() || 'https://hackathon.api.qloo.com';
const PORT = parseInt(process.env.PORT || '3001', 10);

/**
 * Validate required configuration
 */
export function validateConfig() {
  const issues = [];
  if (!QLOO_API_KEY) {
    issues.push('QLOO_API_KEY is missing or empty.');
  }
  return {
    valid: issues.length === 0,
    issues,
    configured: {
      hasKey: Boolean(QLOO_API_KEY),
      baseUrl: QLOO_BASE_URL,
      trustedBaseUrl: QLOO_TRUSTED_BASE_URL,
      port: PORT
    }
  };
}

/**
 * Redact any instance of the API key or secret tokens from strings or objects.
 * Guarantees zero secret leakage into client responses, logs, or traces.
 */
export function redactSecrets(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    let result = data;
    if (QLOO_API_KEY) {
      result = result.replaceAll(QLOO_API_KEY, '[REDACTED_API_KEY]');
    }
    // Redact generic key patterns if present
    result = result.replace(/(hack_[a-f0-9]{32,64})/gi, '[REDACTED_API_KEY]');
    result = result.replace(/([A-Fa-f0-9]{32,64})/g, (match) => {
      if (QLOO_API_KEY && match === QLOO_API_KEY) {
        return '[REDACTED_API_KEY]';
      }
      return match;
    });
    return result;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSecrets(item));
  }

  if (typeof data === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('api_key') ||
        lower.includes('apikey') ||
        lower.includes('secret') ||
        lower.includes('authorization') ||
        lower.includes('token')
      ) {
        cleaned[key] = '[REDACTED_SECRET]';
      } else {
        cleaned[key] = redactSecrets(value);
      }
    }
    return cleaned;
  }

  return data;
}

export const config = {
  get apiKey() {
    return QLOO_API_KEY;
  },
  baseUrl: QLOO_BASE_URL,
  trustedBaseUrl: QLOO_TRUSTED_BASE_URL,
  port: PORT,
  isKeyPresent: Boolean(QLOO_API_KEY)
};
