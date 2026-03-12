/**
 * MODULE 2 — Gemini Intent Parser
 *
 * Uses Gemini ONLY for natural-language → structured-intent extraction.
 * The LLM never ranks or recommends providers; that is done deterministically.
 *
 * Output: ParsedIntent
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ParsedIntent {
  service_type: string;          // normalised activity, e.g. "coffee walk"
  location: string | null;       // free-text location from user, e.g. "Palo Alto"
  time: string | null;           // ISO-8601 or natural phrase, e.g. "tomorrow afternoon"
  budget: number | null;         // dollar amount if mentioned
  tags: string[];                // extra qualifiers: ["relaxed", "outdoor"]
  raw_query: string;             // original message preserved
}

// ── Service-type taxonomy (canonical names) ────────────────────────────────

const SERVICE_TYPE_ALIASES: Record<string, string[]> = {
  'golf':           ['golf', 'golfing', 'driving range', 'tee time', '18 holes', 'golf course', 'golf partner', 'golf buddy', 'golf companion'],
  'coffee walk':    ['coffee walk', 'coffee', 'cafe', 'latte', 'espresso', 'coffee date', 'coffee partner', 'coffee companion'],
  'dog park':       ['dog park', 'dog walk', 'dog', 'puppy', 'pet walk', 'dog companion', 'dog buddy', 'dog partner'],
  'conversation':   ['conversation', 'talk', 'chat', 'listen', 'company', 'companionship', 'conversation partner', 'someone to talk to'],
  'tea':            ['tea', 'afternoon tea', 'tea time', 'tea partner'],
  'walking':        ['walk', 'walking', 'stroll', 'hike', 'hiking'],
  'city tour':      ['city tour', 'tour', 'explore', 'sightseeing', 'downtown', 'tour guide', 'local guide'],
  'photography':    ['photography', 'photographer', 'photo', 'photos', 'picture', 'pictures', 'travel photos'],
  'cooking':        ['cook', 'cooking', 'bake', 'kitchen', 'recipe', 'food'],
  'travel':         ['travel', 'trip', 'day trip', 'adventure', 'food tour', 'explore'],
  'reading':        ['read', 'reading', 'book', 'book club', 'literature'],
};

// ── Local fallback parser (zero-LLM, keyword-based) ───────────────────────

function extractIntentLocal(message: string): ParsedIntent {
  const msg = message.toLowerCase().trim();

  // 1) Service type
  let serviceType = 'general';
  for (const [canonical, aliases] of Object.entries(SERVICE_TYPE_ALIASES)) {
    // Sort by length DESC so longer phrases match first ("coffee walk" before "coffee")
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    if (sorted.some(alias => msg.includes(alias))) {
      serviceType = canonical;
      break;
    }
  }

  // 2) Time
  let time: string | null = null;
  const timePatterns: Array<[RegExp, string]> = [
    [/\b(this morning|tomorrow morning)\b/, 'morning'],
    [/\b(this afternoon|tomorrow afternoon)\b/, 'afternoon'],
    [/\b(this evening|tonight|tomorrow evening)\b/, 'evening'],
    [/\b(this weekend|next weekend|saturday|sunday)\b/, 'weekend'],
    [/\b(tomorrow)\b/, 'tomorrow'],
    [/\b(today)\b/, 'today'],
    [/\b(weekday|monday|tuesday|wednesday|thursday|friday)\b/, 'weekday'],
    [/\b(morning)\b/, 'morning'],
    [/\b(afternoon)\b/, 'afternoon'],
    [/\b(evening|night)\b/, 'evening'],
  ];
  for (const [pattern, label] of timePatterns) {
    if (pattern.test(msg)) {
      time = label;
      break;
    }
  }

  // 3) Budget
  let budget: number | null = null;
  const budgetMatch = msg.match(/\$\s*(\d+)/);
  if (budgetMatch) budget = parseInt(budgetMatch[1]);
  if (!budget) {
    const underMatch = msg.match(/under\s+(\d+)/);
    if (underMatch) budget = parseInt(underMatch[1]);
  }

  // 4) Location (simple extraction)
  let location: string | null = null;
  const locPatterns = [
    /\bin\s+([A-Z][a-zA-Z\s]+?)(?:\s*[,.]|\s+(?:today|tomorrow|this|next|for|and|with|around|near)|\s*$)/,
    /\bnear\s+([A-Z][a-zA-Z\s]+?)(?:\s*[,.]|\s+(?:today|tomorrow|this|next|for)|\s*$)/,
    /\baround\s+([A-Z][a-zA-Z\s]+?)(?:\s*[,.]|\s+(?:today|tomorrow|this|next|for)|\s*$)/,
  ];
  for (const pat of locPatterns) {
    const match = message.match(pat); // case-sensitive on original
    if (match) {
      location = match[1].trim();
      break;
    }
  }

  // 5) Tags — personality / vibe qualifiers
  const tags: string[] = [];
  const tagKeywords: Record<string, string[]> = {
    relaxed:    ['relaxed', 'chill', 'easy-going', 'low-key', 'calm', 'quiet'],
    energetic:  ['energetic', 'active', 'fast', 'intense'],
    social:     ['social', 'outgoing', 'talkative', 'friendly', 'fun'],
    outdoor:    ['outdoor', 'outside', 'nature', 'park', 'trail'],
    beginner:   ['beginner', 'new to', 'first time', 'never tried', 'learning'],
    experienced:['experienced', 'expert', 'advanced', 'pro'],
  };
  for (const [tag, kws] of Object.entries(tagKeywords)) {
    if (kws.some(kw => msg.includes(kw))) tags.push(tag);
  }

  return { service_type: serviceType, location, time, budget, tags, raw_query: message };
}

// ── Gemini-powered parser ──────────────────────────────────────────────────

const GEMINI_PROMPT = `You are a structured-data extraction engine for a companion matching platform called Kindora.

Given a user message, extract a JSON object with these exact fields:
- service_type: string — the primary activity requested (use one of: golf, coffee walk, dog park, conversation, tea, walking, city tour, photography, cooking, travel, reading, general)
- location: string | null — any location mentioned
- time: string | null — any time preference mentioned (e.g. "morning", "tomorrow afternoon", "weekend", "today")
- budget: number | null — any dollar budget mentioned
- tags: string[] — personality/vibe qualifiers like "relaxed", "energetic", "outdoor", "beginner"

RULES:
- Return ONLY valid JSON, no markdown, no explanation.
- If the user says "coffee" the service_type is "coffee walk".
- If the user says "golf" the service_type is "golf".
- If no clear time, set time to null.
- If no clear budget, set budget to null.
- If no clear location, set location to null.

User message: "{MESSAGE}"

JSON:`;

export class GeminiIntentService {
  private genAI: GoogleGenerativeAI | null;
  private model: any;

  constructor() {
    const apiKey = config.gemini.apiKey;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    } else {
      this.genAI = null;
      this.model = null;
    }
  }

  /**
   * Parse a user message into structured intent.
   * Tries Gemini first; falls back to local keyword parser.
   */
  async parse(message: string): Promise<ParsedIntent> {
    // Always compute local as fallback / validation baseline
    const localResult = extractIntentLocal(message);

    if (!this.model) {
      console.log('[GeminiIntentService] No API key — using local parser');
      return localResult;
    }

    try {
      const prompt = GEMINI_PROMPT.replace('{MESSAGE}', message.replace(/"/g, '\\"'));
      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim();

      // Strip markdown fences if present
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(jsonStr);

      // Validate & normalise
      const intent: ParsedIntent = {
        service_type: this.normaliseServiceType(parsed.service_type) || localResult.service_type,
        location: parsed.location || localResult.location,
        time: parsed.time || localResult.time,
        budget: typeof parsed.budget === 'number' ? parsed.budget : localResult.budget,
        tags: Array.isArray(parsed.tags) ? parsed.tags : localResult.tags,
        raw_query: message,
      };

      console.log('[GeminiIntentService] Gemini parsed intent:', JSON.stringify(intent));
      return intent;
    } catch (err) {
      console.error('[GeminiIntentService] Gemini failed, using local fallback:', err);
      return localResult;
    }
  }

  /** Map free-form Gemini output back to our canonical service types */
  private normaliseServiceType(raw: string | undefined): string | null {
    if (!raw) return null;
    const lower = raw.toLowerCase().trim();

    // Direct match
    if (SERVICE_TYPE_ALIASES[lower]) return lower;

    // Check aliases
    for (const [canonical, aliases] of Object.entries(SERVICE_TYPE_ALIASES)) {
      if (aliases.some(a => lower.includes(a) || a.includes(lower))) {
        return canonical;
      }
    }
    return lower; // pass through as-is
  }
}

// Singleton
export const geminiIntentService = new GeminiIntentService();
