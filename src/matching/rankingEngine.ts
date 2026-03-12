/**
 * MODULE 6 — Recommendation Ranking Engine
 *
 * Deterministic, configurable scoring of candidate providers.
 * No LLM involved. Pure math. Fast (<5ms for 1000 providers).
 *
 * Scoring formula:
 *   score = w_activity  × activity_score
 *         + w_rating    × rating_score
 *         + w_popularity× popularity_score
 *         + w_price     × price_score
 *         + w_tag       × tag_score
 *
 * All sub-scores are normalised to [0, 1].
 * Weights are configurable and must sum to 1.0.
 */

import type { ParsedIntent } from '../ai/geminiIntentService.js';
import type { FilteredProvider } from './providerFilter.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RankingWeights {
  activity:    number;   // How well their activities match
  rating:      number;   // Provider star rating
  popularity:  number;   // Review count / rebooking
  price:       number;   // Price attractiveness
  tag:         number;   // Personality/tag overlap
}

export interface RankedProvider extends FilteredProvider {
  matchScore: number;        // 0–100 final score
  matchReasons: string[];    // Human-readable reasons
  scoreBreakdown: {
    activity:   number;
    rating:     number;
    popularity: number;
    price:      number;
    tag:        number;
  };
}

// ── Default weights ────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: RankingWeights = {
  activity:   0.35,    // Activity match is king
  rating:     0.25,    // Provider quality
  popularity: 0.15,    // Social proof
  price:      0.10,    // Budget friendliness
  tag:        0.15,    // Vibe / personality alignment
};

// ── Ranking Engine ─────────────────────────────────────────────────────────

export class RankingEngine {
  private weights: RankingWeights;

  constructor(weights?: Partial<RankingWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Score and rank an array of pre-filtered providers.
   * Returns top `limit` providers sorted by score DESC.
   */
  rank(
    providers: FilteredProvider[],
    intent: ParsedIntent,
    limit: number = 10
  ): RankedProvider[] {
    if (providers.length === 0) return [];

    // Pre-compute normalisation anchors
    const maxReviewCount = Math.max(...providers.map(p => p.reviewCount), 1);
    const maxPrice = Math.max(...providers.map(p => p.price), 1);

    const scored = providers.map(p => this.scoreProvider(p, intent, maxReviewCount, maxPrice));

    // Sort by score DESC, then by rating DESC as tiebreaker
    scored.sort((a, b) => b.matchScore - a.matchScore || b.rating - a.rating);

    return scored.slice(0, limit);
  }

  private scoreProvider(
    provider: FilteredProvider,
    intent: ParsedIntent,
    maxReviewCount: number,
    maxPrice: number
  ): RankedProvider {
    const reasons: string[] = [];

    // ── 1. Activity score ────────────────────────────────────────────────
    let activityScore = 0;
    if (provider.matchedActivities.length > 0) {
      // At least one activity matched (guaranteed by providerFilter)
      activityScore = Math.min(provider.matchedActivities.length / Math.max(provider.activities.length, 1), 1.0);

      // Boost if the matched activity is their PRIMARY activity (first / title-mentioned)
      const titleLower = provider.title.toLowerCase();
      const hasDirectTitleMatch = provider.matchedActivities.some(a =>
        titleLower.includes(a.toLowerCase().split(' ')[0])
      );
      if (hasDirectTitleMatch) {
        activityScore = Math.min(activityScore + 0.3, 1.0);
        reasons.push(`Specialises in ${intent.service_type}`);
      } else {
        reasons.push(`Offers ${provider.matchedActivities[0]}`);
      }
    }

    // ── 2. Rating score ──────────────────────────────────────────────────
    const ratingScore = provider.rating / 5.0;
    if (provider.rating >= 4.8) reasons.push('Top rated');

    // ── 3. Popularity score ──────────────────────────────────────────────
    // Use log scale so a provider with 200 reviews isn't 200× better than one with 1
    const popularityScore =
      (Math.log(provider.reviewCount + 1) / Math.log(maxReviewCount + 1)) * 0.7 +
      (provider.rebookRate / 100) * 0.3;
    if (provider.rebookRate >= 90) reasons.push(`${provider.rebookRate}% rebook rate`);

    // ── 4. Price score ───────────────────────────────────────────────────
    let priceScore = 1.0 - (provider.price / maxPrice);
    if (intent.budget !== null) {
      priceScore = provider.price <= intent.budget
        ? 1.0 - (provider.price / intent.budget) * 0.3   // within budget = good
        : 0.0;                                            // over budget = zero
    }
    if (intent.budget && provider.price <= intent.budget) {
      reasons.push('Within budget');
    }

    // ── 5. Tag / personality score ───────────────────────────────────────
    let tagScore = 0;
    if (intent.tags.length > 0 && provider.matchingProfile) {
      const providerTraits = [
        ...(provider.matchingProfile.personality || []),
        ...(provider.matchingProfile.interests || []),
      ].map(t => t.toLowerCase());

      const matchedTags = intent.tags.filter(tag =>
        providerTraits.some(trait => trait.includes(tag) || tag.includes(trait))
      );
      tagScore = matchedTags.length / intent.tags.length;
      if (matchedTags.length > 0) {
        reasons.push(`Personality: ${matchedTags.join(', ')}`);
      }
    } else {
      tagScore = 0.5; // neutral when no tags specified
    }

    // ── Weighted total ───────────────────────────────────────────────────
    const rawScore =
      this.weights.activity   * activityScore +
      this.weights.rating     * ratingScore +
      this.weights.popularity * popularityScore +
      this.weights.price      * priceScore +
      this.weights.tag        * tagScore;

    const matchScore = Math.round(Math.min(rawScore * 100, 100));

    return {
      ...provider,
      matchScore,
      matchReasons: reasons,
      scoreBreakdown: {
        activity:   Math.round(activityScore * 100),
        rating:     Math.round(ratingScore * 100),
        popularity: Math.round(popularityScore * 100),
        price:      Math.round(priceScore * 100),
        tag:        Math.round(tagScore * 100),
      },
    };
  }
}

export const rankingEngine = new RankingEngine();
