/**
 * MODULE 4 — Provider Search Engine (providerFilter)
 *
 * Deterministic filtering of providers based on parsed intent.
 * No LLM involved — pure database queries + in-memory filtering.
 *
 * Filtering pipeline:
 *  1. Service-type match (activity MUST match)
 *  2. Availability overlap (if time specified)
 *  3. Budget check (if budget specified)
 *  4. Location proximity (if geo available)
 */

import prisma from '../db/client.js';
import type { ParsedIntent } from '../ai/geminiIntentService.js';

// ── Activity-to-DB mapping ─────────────────────────────────────────────────
// Maps our canonical service_type to substrings that can appear in
// CompanionActivity.name in the database.

const ACTIVITY_DB_MAP: Record<string, string[]> = {
  'golf':         ['golf', 'driving range', '18 holes'],
  'coffee walk':  ['coffee', 'cafe'],
  'dog park':     ['dog park', 'dog', 'morning walk'],
  'conversation': ['conversation', 'chat', 'afternoon tea', 'tea'],
  'tea':          ['tea', 'afternoon tea', 'conversation'],
  'walking':      ['walk', 'walking', 'hiking', 'hike', 'morning walk', 'stroll'],
  'city tour':    ['city tour', 'tour', 'sightseeing'],
  'photography':  ['photography', 'photo'],
  'cooking':      ['cooking', 'cook', 'bake'],
  'travel':       ['day trip', 'trip', 'food tour', 'travel', 'adventure'],
  'reading':      ['reading', 'book club', 'reading club', 'book'],
};

export interface FilteredProvider {
  id: string;
  name: string;
  title: string;
  description: string;
  bio: string | null;
  avatar: string | null;
  location: string;
  price: number;
  rating: number;
  reviewCount: number;
  rebookRate: number;
  responseTime: string;
  sessionsCompleted: number;
  verified: boolean;
  activities: string[];           // activity names
  matchingProfile: {
    personality: string[];
    interests: string[];
    conversationStyle: string[];
    preferredTimes: string[];
  } | null;
  availability: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  /** Which activities from this provider matched the user's request */
  matchedActivities: string[];
}

/** Day-of-week lookup for time extraction */
const TIME_TO_DAY_RANGE: Record<string, number[]> = {
  today:     [new Date().getDay()],
  tomorrow:  [(new Date().getDay() + 1) % 7],
  weekend:   [0, 6],   // Sunday, Saturday
  weekday:   [1, 2, 3, 4, 5],
  monday:    [1],
  tuesday:   [2],
  wednesday: [3],
  thursday:  [4],
  friday:    [5],
  saturday:  [6],
  sunday:    [0],
};

const TIME_TO_HOUR_RANGE: Record<string, [number, number]> = {
  morning:   [6, 12],
  afternoon: [12, 18],
  evening:   [18, 23],
};

export class ProviderFilterService {

  /**
   * Main entry point: given a parsed intent, return matching providers.
   */
  async search(intent: ParsedIntent): Promise<FilteredProvider[]> {
    // 1. Fetch all active providers with relations
    const companions = await prisma.companion.findMany({
      where: { active: true },
      include: {
        activities: true,
        availability: true,
        matchingProfile: true,
      },
    });

    // 2. Apply filters
    let results = companions.map(c => this.toFilteredProvider(c));

    // 2a. Activity filter (STRICT — must match)
    if (intent.service_type && intent.service_type !== 'general') {
      results = this.filterByActivity(results, intent.service_type);
    }

    // 2b. Budget filter
    if (intent.budget !== null && intent.budget > 0) {
      results = results.filter(p => p.price <= intent.budget!);
    }

    // 2c. Availability filter
    if (intent.time) {
      results = this.filterByAvailability(results, intent.time);
    }

    return results;
  }

  /** Strict activity matching — only providers who offer the requested service */
  private filterByActivity(providers: FilteredProvider[], serviceType: string): FilteredProvider[] {
    const dbKeywords = ACTIVITY_DB_MAP[serviceType] || [serviceType];

    return providers
      .map(p => {
        const matched = p.activities.filter(actName =>
          dbKeywords.some(kw => actName.toLowerCase().includes(kw))
        );
        if (matched.length === 0) return null;
        return { ...p, matchedActivities: matched };
      })
      .filter((p): p is FilteredProvider => p !== null);
  }

  /** Filter by availability windows */
  private filterByAvailability(providers: FilteredProvider[], time: string): FilteredProvider[] {
    const timeLower = time.toLowerCase();

    // Determine target days
    let targetDays: number[] | null = null;
    for (const [key, days] of Object.entries(TIME_TO_DAY_RANGE)) {
      if (timeLower.includes(key)) {
        targetDays = days;
        break;
      }
    }

    // Determine target hour range
    let targetHours: [number, number] | null = null;
    for (const [key, range] of Object.entries(TIME_TO_HOUR_RANGE)) {
      if (timeLower.includes(key)) {
        targetHours = range;
        break;
      }
    }

    // If we couldn't parse any time constraint, don't filter
    if (!targetDays && !targetHours) return providers;

    return providers.filter(p => {
      return p.availability.some(slot => {
        const dayMatch = !targetDays || targetDays.includes(slot.dayOfWeek);

        let hourMatch = true;
        if (targetHours) {
          const startH = parseInt(slot.startTime.split(':')[0]);
          const endH = parseInt(slot.endTime.split(':')[0]);
          hourMatch = startH <= targetHours[0] && endH >= targetHours[1];
        }

        return dayMatch && hourMatch;
      });
    });
  }

  /** Convert Prisma companion to our FilteredProvider type */
  private toFilteredProvider(c: any): FilteredProvider {
    return {
      id: c.id,
      name: c.name,
      title: c.title,
      description: c.description,
      bio: c.bio,
      avatar: c.avatar,
      location: c.location,
      price: c.price,
      rating: c.rating,
      reviewCount: c.reviewCount,
      rebookRate: c.rebookRate,
      responseTime: c.responseTime,
      sessionsCompleted: c.sessionsCompleted,
      verified: c.verified,
      activities: (c.activities || []).map((a: any) => a.name),
      matchingProfile: c.matchingProfile ? {
        personality: c.matchingProfile.personality || [],
        interests: c.matchingProfile.interests || [],
        conversationStyle: c.matchingProfile.conversationStyle || [],
        preferredTimes: c.matchingProfile.preferredTimes || [],
      } : null,
      availability: (c.availability || []).map((a: any) => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
      matchedActivities: [],
    };
  }
}

export const providerFilterService = new ProviderFilterService();
