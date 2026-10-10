/**
 * In-memory TTL cache for Qloo requests and workflow executions.
 * Prevents redundant calls to the Qloo API and reduces rate-limit pressure.
 */
export class MemoryCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 500;
    this.defaultTtlMs = options.defaultTtlMs || 10 * 60 * 1000; // 10 minutes
    this.store = new Map();
  }

  /**
   * Compute deterministic cache key from operation and parameters
   */
  static makeKey(operation, params = {}) {
    // Sort keys for deterministic hashing
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {});
    return `${operation}:${JSON.stringify(sortedParams)}`;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Refresh access order (LRU behavior)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.store.size >= this.maxSize) {
      // Remove oldest entry
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now()
    });
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.store.clear();
  }

  size() {
    this._pruneExpired();
    return this.store.size;
  }

  _pruneExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

export const qlooCache = new MemoryCache();
