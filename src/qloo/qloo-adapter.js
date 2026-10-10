import { createDirectQlooWorkflowExecutorFromEnvironment } from '@qloo/qloo-harness';
import { config, redactSecrets } from '../config.js';
import { qlooCache, MemoryCache } from '../cache.js';

/**
 * Official Qloo Service Adapter
 * 
 * Provides verified server-side integration with Qloo's Hackathon API.
 * Encapsulates:
 * - find_tags
 * - describe
 * - recommend
 * - rank
 * 
 * Guarantees:
 * - Server-side only key retention (no leakage)
 * - Strict input validation
 * - Preserved Qloo URNs & IDs
 * - Zero result fabrication
 * - Resilient error/timeout/empty handling
 */
export class QlooAdapter {
  constructor(options = {}) {
    this.cache = options.cache || qlooCache;
    this.executor = options.executor || null;
    this._initExecutor();
  }

  _initExecutor() {
    if (!this.executor) {
      if (!config.apiKey) {
        throw new Error('QLOO_API_KEY is not configured. Cannot initialize Qloo adapter.');
      }
      this.executor = createDirectQlooWorkflowExecutorFromEnvironment({
        env: {
          QLOO_API_KEY: config.apiKey,
          QLOO_BASE_URL: config.baseUrl,
          QLOO_TRUSTED_BASE_URL: config.trustedBaseUrl
        }
      });
      if (!this.executor) {
        throw new Error('Failed to create official Qloo workflow executor from environment.');
      }
    }
  }

  /**
   * 1. find_tags
   * Discovers cultural taxonomy tags and affinities.
   */
  async findTags(params) {
    if (!params || typeof params.query !== 'string' || !params.query.trim()) {
      return {
        status: 'error',
        error: { code: 'INVALID_INPUT', message: 'Parameter "query" must be a non-empty string.' },
        results: [],
        result_count: 0
      };
    }

    const cleanInput = {
      query: params.query.trim(),
      limit: typeof params.limit === 'number' && params.limit > 0 ? Math.min(params.limit, 50) : 10,
      semantic: params.semantic !== false
    };

    const cacheKey = MemoryCache.makeKey('find_tags', cleanInput);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    try {
      const response = await this.executor.execute('find_tags', cleanInput);
      const normalized = this._normalizeFindTags(response);
      this.cache.set(cacheKey, normalized);
      return normalized;
    } catch (err) {
      return this._handleExecutionError('find_tags', err);
    }
  }

  /**
   * 2. describe
   * Retrieves ground-truth entity profile from Qloo.
   */
  async describe(params) {
    if (!params || typeof params.entity !== 'string' || !params.entity.trim()) {
      return {
        status: 'error',
        error: { code: 'INVALID_INPUT', message: 'Parameter "entity" must be a non-empty string or ID.' },
        results: [],
        result_count: 0
      };
    }

    const cleanInput = {
      entity: params.entity.trim(),
      ...(params.type ? { type: params.type.trim() } : {})
    };

    const cacheKey = MemoryCache.makeKey('describe', cleanInput);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    try {
      const response = await this.executor.execute('describe', cleanInput);
      const normalized = this._normalizeDescribe(response);
      this.cache.set(cacheKey, normalized);
      return normalized;
    } catch (err) {
      return this._handleExecutionError('describe', err);
    }
  }

  /**
   * 3. recommend
   * Generates cross-domain recommendations based on aggregate taste signals.
   */
  async recommend(params) {
    if (!params || typeof params.target_type !== 'string' || !params.target_type.trim()) {
      return {
        status: 'error',
        error: { code: 'INVALID_INPUT', message: 'Parameter "target_type" is required.' },
        results: [],
        result_count: 0
      };
    }

    const hasSignal =
      (Array.isArray(params.signals) && params.signals.length > 0) ||
      (Array.isArray(params.signal_tags) && params.signal_tags.length > 0) ||
      Boolean(params.signal_location) ||
      Boolean(params.demographic);

    if (!hasSignal) {
      return {
        status: 'needs_input',
        message: 'Provide at least one signal (entity, tag, location, or demographic).',
        results: [],
        result_count: 0
      };
    }

    const cleanInput = {
      target_type: params.target_type.trim(),
      ...(Array.isArray(params.signals) && params.signals.length > 0 ? { signals: params.signals } : {}),
      ...(Array.isArray(params.signal_tags) && params.signal_tags.length > 0 ? { signal_tags: params.signal_tags } : {}),
      ...(params.signal_location ? { signal_location: params.signal_location.trim() } : {}),
      ...(params.filter_location ? { filter_location: params.filter_location.trim() } : {}),
      ...(Array.isArray(params.include_tags) && params.include_tags.length > 0 ? { include_tags: params.include_tags } : {}),
      ...(Array.isArray(params.exclude_tags) && params.exclude_tags.length > 0 ? { exclude_tags: params.exclude_tags } : {}),
      limit: typeof params.limit === 'number' && params.limit > 0 ? Math.min(params.limit, 50) : 10,
      explain: params.explain !== false
    };

    const cacheKey = MemoryCache.makeKey('recommend', cleanInput);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    try {
      const response = await this.executor.execute('recommend', cleanInput);
      const normalized = this._normalizeRecommend(response);
      this.cache.set(cacheKey, normalized);
      return normalized;
    } catch (err) {
      return this._handleExecutionError('recommend', err);
    }
  }

  /**
   * 4. rank
   * Ranks candidates based on affinity to specified signals.
   */
  async rank(params) {
    if (!params || typeof params.option_type !== 'string' || !params.option_type.trim()) {
      return {
        status: 'error',
        error: { code: 'INVALID_INPUT', message: 'Parameter "option_type" is required.' },
        results: [],
        result_count: 0
      };
    }

    if (!Array.isArray(params.options) || params.options.length === 0) {
      return {
        status: 'error',
        error: { code: 'INVALID_INPUT', message: 'Parameter "options" must be a non-empty array.' },
        results: [],
        result_count: 0
      };
    }

    const hasSignal =
      (Array.isArray(params.signals) && params.signals.length > 0) ||
      Boolean(params.signal_location) ||
      Boolean(params.demographic);

    if (!hasSignal) {
      return {
        status: 'needs_input',
        message: 'Ranking requires an entity, location, or demographic signal.',
        results: [],
        result_count: 0
      };
    }

    const cleanInput = {
      option_type: params.option_type.trim(),
      options: params.options,
      ...(Array.isArray(params.signals) && params.signals.length > 0 ? { signals: params.signals } : {}),
      ...(params.signal_location ? { signal_location: params.signal_location.trim() } : {}),
      ...(params.demographic ? { demographic: params.demographic.trim() } : {}),
      ...(Array.isArray(params.include_tags) && params.include_tags.length > 0 ? { include_tags: params.include_tags } : {}),
      ...(Array.isArray(params.exclude_tags) && params.exclude_tags.length > 0 ? { exclude_tags: params.exclude_tags } : {})
    };

    const cacheKey = MemoryCache.makeKey('rank', cleanInput);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    try {
      const response = await this.executor.execute('rank', cleanInput);
      const normalized = this._normalizeRank(response);
      this.cache.set(cacheKey, normalized);
      return normalized;
    } catch (err) {
      return this._handleExecutionError('rank', err);
    }
  }

  // --- Response Normalizers ---

  _normalizeFindTags(envelope) {
    const raw = envelope.result || {};
    const results = Array.isArray(raw.results) ? raw.results : [];
    return {
      status: results.length > 0 ? (raw.status || 'ok') : 'empty',
      workflow: 'find_tags',
      results: results.map((tag) => ({
        id: tag.id || tag.tag_id || '',
        name: tag.name || '',
        type: tag.type || tag.subtype || 'urn:tag',
        popularity: typeof tag.popularity === 'number' ? tag.popularity : null,
        affinity: typeof tag.affinity === 'number' ? tag.affinity : null
      })),
      result_count: results.length,
      provenance: redactSecrets(raw.provenance || { source: 'Qloo API', endpoint: '/v2/tags' }),
      execution: {
        duration_ms: envelope.durationMs || 0,
        correlation_id: envelope.correlationId || ''
      }
    };
  }

  _normalizeDescribe(envelope) {
    const raw = envelope.result || {};
    const results = Array.isArray(raw.results) ? raw.results : [];
    const isNeedsInput = raw.status === 'needs_input';
    return {
      status: isNeedsInput ? 'needs_input' : results.length > 0 ? (raw.status || 'ok') : 'empty',
      workflow: 'describe',
      results: results.map((entity) => ({
        entity_id: entity.entity_id || entity.id || '',
        name: entity.name || '',
        type: entity.type || '',
        subtype: entity.subtype || null,
        popularity: typeof entity.popularity === 'number' ? entity.popularity : null,
        affinity: typeof entity.affinity === 'number' ? entity.affinity : null,
        properties: entity.properties || {}
      })),
      result_count: results.length,
      ...(isNeedsInput && raw.resolution ? { resolution: raw.resolution } : {}),
      provenance: redactSecrets(raw.provenance || { source: 'Qloo API', endpoint: '/entities' }),
      execution: {
        duration_ms: envelope.durationMs || 0,
        correlation_id: envelope.correlationId || ''
      }
    };
  }

  _normalizeRecommend(envelope) {
    const raw = envelope.result || {};
    const results = Array.isArray(raw.results) ? raw.results : [];
    const isNeedsInput = raw.status === 'needs_input';
    return {
      status: isNeedsInput ? 'needs_input' : results.length > 0 ? (raw.status || 'ok') : 'empty',
      workflow: 'recommend',
      results: results.map((entity) => ({
        entity_id: entity.entity_id || entity.id || '',
        name: entity.name || '',
        type: entity.type || '',
        subtype: entity.subtype || null,
        popularity: typeof entity.popularity === 'number' ? entity.popularity : null,
        affinity: typeof entity.affinity === 'number' ? entity.affinity : null,
        properties: entity.properties || {},
        ...(entity.explainability ? { explainability: entity.explainability } : {})
      })),
      result_count: results.length,
      explainability: raw.explainability || null,
      ...(isNeedsInput && raw.resolution ? { resolution: raw.resolution } : {}),
      provenance: redactSecrets(raw.provenance || { source: 'Qloo API', endpoint: '/v2/insights' }),
      execution: {
        duration_ms: envelope.durationMs || 0,
        correlation_id: envelope.correlationId || ''
      }
    };
  }

  _normalizeRank(envelope) {
    const raw = envelope.result || {};
    const results = Array.isArray(raw.results) ? raw.results : [];
    const isNeedsInput = raw.status === 'needs_input';
    return {
      status: isNeedsInput ? 'needs_input' : results.length > 0 ? (raw.status || 'ok') : 'empty',
      workflow: 'rank',
      results: results.map((entity, index) => ({
        rank: index + 1,
        entity_id: entity.entity_id || entity.id || '',
        name: entity.name || '',
        type: entity.type || '',
        subtype: entity.subtype || null,
        affinity: typeof entity.affinity === 'number' ? entity.affinity : null,
        popularity: typeof entity.popularity === 'number' ? entity.popularity : null,
        properties: entity.properties || {}
      })),
      result_count: results.length,
      ...(isNeedsInput && raw.resolution ? { resolution: raw.resolution } : {}),
      provenance: redactSecrets(raw.provenance || { source: 'Qloo API', endpoint: '/v2/insights' }),
      execution: {
        duration_ms: envelope.durationMs || 0,
        correlation_id: envelope.correlationId || ''
      }
    };
  }

  _handleExecutionError(operation, error) {
    const safeMessage = redactSecrets(error.message || 'Qloo execution failed');
    const isTimeout =
      error.code === 'QLOO_TIMEOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('timed out');
    const isRateLimit =
      error.code === 'QLOO_RATE_LIMIT' ||
      error.message?.includes('429') ||
      error.message?.includes('rate limit');
    const isAuth =
      error.code === 'QLOO_AUTH' ||
      error.message?.includes('401') ||
      error.message?.includes('403');

    return {
      status: 'error',
      workflow: operation,
      error: {
        code: isTimeout
          ? 'QLOO_TIMEOUT'
          : isRateLimit
          ? 'QLOO_RATE_LIMIT'
          : isAuth
          ? 'QLOO_AUTH_ERROR'
          : error.code || 'QLOO_ERROR',
        message: safeMessage,
        retryable: error.retryable ?? (isTimeout || isRateLimit),
        layer: error.layer || 'qloo'
      },
      results: [],
      result_count: 0
    };
  }
}

export const defaultQlooAdapter = new QlooAdapter();
