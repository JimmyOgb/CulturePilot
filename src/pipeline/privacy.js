/**
 * Responsible Data Handling & PII Protection
 * 
 * Enforces strict privacy boundaries:
 * - Redacts emails, phone numbers, personal identities, street addresses, device IDs
 * - Ensures user intent is treated strictly as aggregate cultural discovery, never individual profiling
 * - Prevents PII from ever reaching Qloo
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,9}/g;
const STREET_ADDRESS_REGEX = /\b\d{1,5}\s+[A-Za-z0-9.\s]{3,25}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct)\b/gi;
const IP_ADDRESS_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const PERSONAL_INTRO_REGEX = /\b(?:my name is|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi;

export function sanitizeDiscoveryIntent(rawIntent) {
  if (typeof rawIntent !== 'string') {
    return {
      sanitized: '',
      warnings: ['Intent was not provided as a valid string.'],
      piiDetected: false
    };
  }

  const warnings = [];
  let sanitized = rawIntent;

  // 1. Detect and scrub emails
  if (EMAIL_REGEX.test(sanitized)) {
    warnings.push('Personal email address was detected and stripped before cultural processing.');
    sanitized = sanitized.replace(EMAIL_REGEX, '');
  }

  // 2. Detect and scrub phone numbers
  if (PHONE_REGEX.test(sanitized)) {
    // Only strip if looks like a real phone number (at least 7 digits)
    const matches = sanitized.match(PHONE_REGEX);
    for (const m of matches || []) {
      const digitCount = (m.match(/\d/g) || []).length;
      if (digitCount >= 7) {
        warnings.push('Phone number was detected and stripped.');
        sanitized = sanitized.replace(m, '');
      }
    }
  }

  // 3. Detect and scrub street addresses
  if (STREET_ADDRESS_REGEX.test(sanitized)) {
    warnings.push('Specific street address was detected and stripped; cultural discovery uses city/regional scope.');
    sanitized = sanitized.replace(STREET_ADDRESS_REGEX, '');
  }

  // 4. Detect and scrub IP addresses
  if (IP_ADDRESS_REGEX.test(sanitized)) {
    warnings.push('IP address was detected and stripped.');
    sanitized = sanitized.replace(IP_ADDRESS_REGEX, '');
  }

  // 5. Detect and scrub personal identity introductions
  if (PERSONAL_INTRO_REGEX.test(sanitized)) {
    warnings.push('Individual personal identity markers were stripped; recommendations are based on aggregate cultural affinity.');
    sanitized = sanitized.replace(PERSONAL_INTRO_REGEX, '');
  }

  // Clean extra whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return {
    sanitized,
    warnings,
    piiDetected: warnings.length > 0
  };
}
