import { defaultQlooAdapter } from '../qloo/qloo-adapter.js';
import { sanitizeDiscoveryIntent } from './privacy.js';
import { redactSecrets } from '../config.js';
import { synthesizeCulturalSummary } from '../gemini/gemini-client.js';

// Pre-compiled domain relevance patterns with word boundaries
const ART_PATTERN = /\b(?:art|arts|artsy|cultural center|gallery|galleries|museum|museums|exhibition|exhibitions|performing arts|theatre|theater|contemporary art)\b/i;
const COFFEE_PATTERN = /\b(?:coffee|cafe|cafes|espresso|cappuccino|roastery)\b/i;
const SPORTS_PATTERN = /\b(?:sports|athletic|athletics|stadium|football pitch|basketball court|running track)\b/i;
const RELIGIOUS_PATTERN = /\b(?:church|ministry|pastor|mosque|cathedral|chapel)\b/i;
const EDUCATION_PATTERN = /\b(?:university|college|business school|academic environment)\b/i;
const RESIDENTIAL_PATTERN = /\b(?:residential estate|gated estate|island neighborhood)\b/i;
const INFRASTRUCTURE_PATTERN = /\b(?:toll plaza|toll gate)\b/i;
const MARKET_PATTERN = /\b(?:electronics market)\b/i;

/**
 * CulturePilot Cultural Intent Pipeline
 * 
 * Orchestrates:
 * natural-language intent
 * → sanitize & extract cultural signals
 * → find_tags (Qloo taxonomy resolution)
 * → resolve verified tags & entities
 * → recommend by category (arts/design, coffee, music, social)
 * → transparent semantic relevance validation & exclusion
 * → normalized CulturePilot response with provenance and category separation
 */
export class CulturePilotPipeline {
  constructor(options = {}) {
    this.adapter = options.adapter || defaultQlooAdapter;
  }

  /**
   * Main entry point
   * @param {Object} input - { intent: string }
   * @returns {Promise<Object>} Stable CulturePilot API response
   */
  async process(input) {
    const rawIntent = input?.intent;

    if (!rawIntent || typeof rawIntent !== 'string' || !rawIntent.trim()) {
      return {
        status: 'needs_input',
        intent: '',
        message: 'Please provide a natural-language cultural discovery intent (e.g. destination, vibe, or taste preferences).',
        categories: {},
        results: [],
        excluded: [],
        connections: [],
        provenance: [],
        warnings: ['Empty or missing intent field.']
      };
    }

    // 1. Responsible Data Handling & Privacy Sanitization
    const { sanitized, warnings } = sanitizeDiscoveryIntent(rawIntent);

    if (!sanitized) {
      return {
        status: 'needs_input',
        intent: rawIntent,
        message: 'Intent contained only sensitive personal markers without cultural discovery terms.',
        categories: {},
        results: [],
        excluded: [],
        connections: [],
        provenance: [],
        warnings
      };
    }

    const allWarnings = [...warnings];
    const allProvenance = [];

    // 2. Extract Geographic Anchor and Cultural Themes
    const signals = this._extractCulturalSignals(sanitized);

    // 3. Resolve Cultural Tags via Qloo find_tags
    const resolvedTags = await this._resolveTags(signals.themes, allProvenance, allWarnings);

    if (resolvedTags.length === 0 && !signals.location) {
      return {
        status: 'empty',
        intent: sanitized,
        message: 'No matching cultural tags or geographic anchors could be resolved from the provided intent in Qloo.',
        categories: {},
        results: [],
        excluded: [],
        connections: [],
        provenance: allProvenance,
        warnings: allWarnings
      };
    }

    // 4. Category-Separated Cultural Discovery
    const { categories, excluded, hasErrors } = await this._executeCategorizedDiscovery(
      signals,
      resolvedTags,
      allProvenance,
      allWarnings
    );

    // Consolidate accepted results across categories
    const allResults = Object.values(categories).flatMap((cat) => cat.results || []);

    // 5. Build Cross-Domain Connections between genuine matching entities
    const connections = this._buildCrossDomainConnections(categories, resolvedTags);

    // 6. Determine Explicit Status
    const requestedCategories = [];
    if (signals.requestedTypes.arts_and_design) requestedCategories.push('arts_and_design');
    if (signals.requestedTypes.coffee) requestedCategories.push('coffee');
    if (signals.requestedTypes.music) requestedCategories.push('music');

    const emptyCategories = requestedCategories.filter(
      (catKey) => !categories[catKey] || categories[catKey].results.length === 0
    );

    let status = 'ok';
    if (hasErrors && allResults.length > 0) {
      status = 'degraded';
    } else if (emptyCategories.length > 0 && allResults.length > 0) {
      status = 'partial';
      allWarnings.push(
        `Limited catalog coverage: ${emptyCategories.join(', ')} had no verified semantic matches in Qloo for ${signals.location || 'the requested destination'}.`
      );
    } else if (allResults.length === 0) {
      status = hasErrors ? 'degraded' : 'empty';
    }

    // Optional AI Studio curator synthesis strictly grounded in verified entities
    const curatorSynthesis = await synthesizeCulturalSummary({ intent: sanitized, categories });

    return {
      status,
      intent: sanitized,
      discovery_context: {
        location: signals.location || null,
        identified_signals: resolvedTags.map((t) => ({ id: t.id, name: t.name, type: t.type })),
        interpretation: 'Cultural discovery based on aggregate affinity and taste signals from Qloo.',
        curator_synthesis: curatorSynthesis || null
      },
      categories,
      results: allResults,
      excluded,
      connections,
      provenance: allProvenance,
      warnings: allWarnings
    };
  }

  /**
   * Extract cultural signals: location, taste themes, and explicit category requirements
   */
  _extractCulturalSignals(text) {
    let location = null;
    const locationPatterns = [
      /\b(?:in|around|near|visit|visiting|trip to|weekend in)\s+([A-Za-z0-9][a-zA-Z0-9\s]{1,30}?)(?=[,\.\b]|\s+with|\s+and|\s+for|$)/i,
      /\b(?:Lagos|Abuja|Accra|Nairobi|London|Paris|Tokyo|Berlin|New York|Rome|Lisbon|Amsterdam|Barcelona|Cape Town)\b/i
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        location = match[1] || match[0];
        location = location.trim();
        break;
      }
    }

    const lower = text.toLowerCase();
    const requestedTypes = {
      coffee: lower.includes('coffee') || lower.includes('cafe') || lower.includes('espresso'),
      arts_and_design:
        lower.includes('artsy') ||
        lower.includes('art gallery') ||
        lower.includes('art') ||
        lower.includes('design') ||
        lower.includes('museum') ||
        lower.includes('cultural'),
      music: lower.includes('indie-music') || lower.includes('music') || lower.includes('indie rock') || lower.includes('indie') || lower.includes('band') || lower.includes('bands') || lower.includes('artist')
    };

    const themes = [];
    if (requestedTypes.music) themes.push('indie rock');
    if (requestedTypes.coffee) themes.push('coffee');
    if (requestedTypes.arts_and_design) {
      themes.push('art gallery');
      themes.push('design');
    }

    if (themes.length === 0) {
      const words = lower
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !['want', 'weekend', 'with', 'vibe', 'good', 'some', 'trip', 'need', 'like'].includes(w));
      themes.push(...words.slice(0, 3));
    }

    return {
      location,
      themes: [...new Set(themes)],
      requestedTypes
    };
  }

  /**
   * Resolve tags via Qloo find_tags
   */
  async _resolveTags(themes, provenanceList, warningsList) {
    const resolved = [];

    for (const theme of themes) {
      try {
        const response = await this.adapter.findTags({ query: theme, limit: 3, semantic: true });
        if (response.provenance) {
          provenanceList.push(response.provenance);
        }
        if (response.status === 'ok' && Array.isArray(response.results) && response.results.length > 0) {
          resolved.push(response.results[0]);
        }
      } catch (err) {
        warningsList.push(`find_tags query for "${theme}" failed: ${redactSecrets(err.message)}`);
      }
    }

    return resolved;
  }

  /**
   * Execute categorized discovery with transparent semantic relevance checks
   */
  async _executeCategorizedDiscovery(signals, resolvedTags, provenanceList, warningsList) {
    const categories = {
      arts_and_design: { status: 'empty', results: [], count: 0 },
      coffee: { status: 'empty', results: [], count: 0 },
      music: { status: 'empty', results: [], count: 0 }
    };
    const excluded = [];
    let hasErrors = false;

    const tagIds = resolvedTags.map((t) => t.id).filter(Boolean);

    // 1. Venues Query (Only query places if location or venue-specific categories were requested)
    const shouldQueryVenues =
      Boolean(signals.location) ||
      signals.requestedTypes.coffee ||
      signals.requestedTypes.arts_and_design;

    if (shouldQueryVenues && (signals.location || tagIds.length > 0)) {
      try {
        const placeParams = {
          target_type: 'place',
          limit: 20
        };
        if (signals.location) {
          placeParams.filter_location = signals.location;
          placeParams.signal_location = signals.location;
        }
        if (tagIds.length > 0) {
          placeParams.signal_tags = tagIds;
        }

        const placeRecs = await this.adapter.recommend(placeParams);
        if (placeRecs.provenance) {
          provenanceList.push(placeRecs.provenance);
        }

        if (placeRecs.status === 'ok' && Array.isArray(placeRecs.results)) {
          for (const place of placeRecs.results) {
            const evaluation = this._evaluateVenueRelevance(place, signals.requestedTypes);

            if (evaluation.acceptedCategory) {
              const formatted = this._formatResult(
                place,
                evaluation.acceptedCategory,
                'recommend',
                evaluation.matchReason
              );
              categories[evaluation.acceptedCategory].results.push(formatted);
            } else {
              excluded.push({
                name: place.name,
                entity_id: place.entity_id,
                reason: evaluation.exclusionReason,
                source: {
                  workflow: 'recommend',
                  qloo_entity_id: place.entity_id
                }
              });
            }
          }
        } else if (placeRecs.status === 'error') {
          hasErrors = true;
          warningsList.push(`Venue recommendations failed: ${redactSecrets(placeRecs.error?.message || 'Error')}`);
        }
      } catch (err) {
        hasErrors = true;
        warningsList.push(`Venue discovery encountered an exception: ${redactSecrets(err.message)}`);
      }
    }

    // Update status and count for place categories
    for (const key of ['arts_and_design', 'coffee']) {
      categories[key].count = categories[key].results.length;
      categories[key].status = categories[key].count > 0 ? 'ok' : 'empty';
      if (categories[key].count === 0 && signals.requestedTypes[key]) {
        categories[key].message = `Qloo catalog contains no dedicated ${key.replace('_', ' ')} venues in ${signals.location || 'this location'} with verified semantic alignment.`;
      }
    }

    // 2. Music Discovery (Query if music was requested or general discovery)
    const shouldQueryMusic =
      signals.requestedTypes.music ||
      (!signals.requestedTypes.coffee && !signals.requestedTypes.arts_and_design);

    if (shouldQueryMusic && tagIds.length > 0) {
      try {
        const musicParams = {
          target_type: 'artist',
          limit: 5,
          signal_tags: tagIds
        };
        if (signals.location) {
          musicParams.signal_location = signals.location;
        }

        const artistRecs = await this.adapter.recommend(musicParams);
        if (artistRecs.provenance) {
          provenanceList.push(artistRecs.provenance);
        }

        if (artistRecs.status === 'ok' && Array.isArray(artistRecs.results)) {
          for (const artist of artistRecs.results) {
            const reason = signals.location
              ? `Surfaced via aggregate taste affinity connecting indie vibe with the ${signals.location} cultural audience.`
              : 'Surfaced via aggregate taste affinity for indie cultural signals.';

            categories.music.results.push(
              this._formatResult(artist, 'music', 'recommend', reason)
            );
          }
        } else if (artistRecs.status === 'error') {
          hasErrors = true;
          warningsList.push(`Music recommendations failed: ${redactSecrets(artistRecs.error?.message || 'Error')}`);
        }
      } catch (err) {
        hasErrors = true;
        warningsList.push(`Music discovery encountered an exception: ${redactSecrets(err.message)}`);
      }

      categories.music.count = categories.music.results.length;
      categories.music.status = categories.music.count > 0 ? 'ok' : 'empty';
    }

    return { categories, excluded, hasErrors };
  }

  /**
   * Transparent semantic relevance validation
   * Excludes entities that fail requested category constraints
   */
  _evaluateVenueRelevance(place, requestedTypes) {
    const text = `${place.name || ''} ${place.properties?.description || ''}`.toLowerCase();

    // 1. Explicit Exclusions for non-relevant facility types
    if (SPORTS_PATTERN.test(text)) {
      return { acceptedCategory: null, exclusionReason: 'Athletic/sports facility; does not match arts, design, or dining.' };
    }
    if (RELIGIOUS_PATTERN.test(text)) {
      return { acceptedCategory: null, exclusionReason: 'Religious institution; does not match secular cultural intent.' };
    }
    if (EDUCATION_PATTERN.test(text)) {
      return { acceptedCategory: null, exclusionReason: 'Educational campus without dedicated public arts space.' };
    }
    if (INFRASTRUCTURE_PATTERN.test(text)) {
      return { acceptedCategory: null, exclusionReason: 'Transportation infrastructure / toll plaza.' };
    }
    if (MARKET_PATTERN.test(text)) {
      return { acceptedCategory: null, exclusionReason: 'Commercial electronics repair market.' };
    }
    if (RESIDENTIAL_PATTERN.test(text)) {
      return { acceptedCategory: null, exclusionReason: 'Gated residential neighborhood without specific public venue.' };
    }

    // 2. Arts & Design check
    if (requestedTypes.arts_and_design && ART_PATTERN.test(text)) {
      return {
        acceptedCategory: 'arts_and_design',
        matchReason: 'Verified multidisciplinary cultural and arts venue matching artsy/design intent.'
      };
    }

    // 3. Coffee check
    if (requestedTypes.coffee && COFFEE_PATTERN.test(text)) {
      return {
        acceptedCategory: 'coffee',
        matchReason: 'Verified dedicated cafe / coffee establishment.'
      };
    }

    // Default exclusion for general commercial entities not explicitly requested
    return {
      acceptedCategory: null,
      exclusionReason: 'General commercial or lodging facility without dedicated arts or coffee focus.'
    };
  }

  /**
   * Format standardized CulturePilot result with provenance
   */
  _formatResult(entity, category, workflow, matchReason) {
    return {
      name: entity.name || 'Unknown Cultural Entity',
      type: entity.subtype || entity.type || `urn:entity:${category}`,
      entity_id: entity.entity_id || '',
      category,
      tags: entity.properties?.categories || [],
      affinity: typeof entity.affinity === 'number' ? entity.affinity : null,
      popularity: typeof entity.popularity === 'number' ? entity.popularity : null,
      properties: {
        description: entity.properties?.description || entity.properties?.short_description || null,
        address: entity.properties?.address || null,
        geocode: entity.properties?.geocode || null,
        image_url: entity.properties?.image?.url || null,
        rating: entity.properties?.business_rating || null,
        price_level: entity.properties?.price_level || null
      },
      reason: matchReason || `Discovered through aggregate cultural affinity in Qloo taste graph for ${category}.`,
      source: {
        workflow,
        qloo_entity_id: entity.entity_id || ''
      }
    };
  }

  /**
   * Build cross-domain taste connections
   */
  _buildCrossDomainConnections(categories, tags) {
    const arts = categories.arts_and_design?.results || [];
    const music = categories.music?.results || [];
    const connections = [];

    for (const art of arts) {
      for (const artist of music) {
        connections.push({
          source_entity: art.name,
          target_entity: artist.name,
          connection_type: 'taste_affinity',
          shared_cultural_vibe: tags.map((t) => t.name).join(', '),
          basis: 'Shared aggregate taste affinities connecting venue cultural identity with musical atmosphere.'
        });
      }
    }

    return connections;
  }
}

export const defaultCulturePipeline = new CulturePilotPipeline();
