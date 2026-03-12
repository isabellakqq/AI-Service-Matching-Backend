/**
 * MODULE 1 — Chat Request Handler
 *
 * Orchestrator that ties all modules together:
 *   User message → Gemini intent parser → Provider filter → Ranking engine → Response
 *
 * Also generates the conversational AI response text.
 */

import { geminiIntentService, type ParsedIntent } from '../ai/geminiIntentService.js';
import { providerFilterService, type FilteredProvider } from '../matching/providerFilter.js';
import { rankingEngine, type RankedProvider } from '../matching/rankingEngine.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  userId?: string;
  location?: { lat: number; lng: number };
}

export interface ChatResponse {
  response: string;                // Conversational text
  intent: ParsedIntent;            // What we understood
  recommendations: RankedProvider[];// Scored & ranked providers
  extractedPreferences: ParsedIntent;// Alias for frontend compat
}

// ── Response generator ─────────────────────────────────────────────────────

function generateResponseText(
  intent: ParsedIntent,
  ranked: RankedProvider[]
): string {
  const msg = intent.raw_query.toLowerCase().trim();

  // Greetings
  if (/^(hi|hello|hey|howdy|sup|yo)\b/.test(msg) && intent.service_type === 'general') {
    return "Hey there! 👋 I'd love to help you find the perfect companion. What kind of activity are you looking for? We have companions for golf, coffee walks, dog park visits, conversations, travel, and more!";
  }

  // Thank you
  if (/\b(thanks|thank you|thx|ty)\b/.test(msg)) {
    return "You're welcome! Let me know if you'd like to find another companion or need anything else. 😊";
  }

  // How does it work
  if (/\b(how.*work|what.*do|explain|about|help)\b/.test(msg) && intent.service_type === 'general') {
    return "Here's how Kindora works: Tell me what you're looking for (like 'coffee walk' or 'golf partner'), and I'll find the best-matched companions based on their specialties, ratings, and availability. You can then view their profiles and book a session!";
  }

  // No providers found
  if (ranked.length === 0) {
    if (intent.service_type !== 'general') {
      return `I looked for companions who specialise in ${intent.service_type}, but didn't find a match right now.${intent.budget ? ` (budget: $${intent.budget})` : ''} Try broadening your search — for example, removing the budget filter or trying a different time.`;
    }
    return "I'd love to help! Could you tell me what kind of activity you're looking for? For example: golf, coffee walk, conversation, dog park, travel…";
  }

  // Build recommendation text
  const topNames = ranked.slice(0, 3).map(p => p.name);
  const nameList = topNames.length <= 2
    ? topNames.join(' and ')
    : topNames.slice(0, -1).join(', ') + ', and ' + topNames[topNames.length - 1];

  const activity = intent.service_type !== 'general' ? intent.service_type : 'your request';
  const timeNote = intent.time ? ` for ${intent.time}` : '';

  // Explain WHY these are the top picks
  const topProvider = ranked[0];
  const topReason = topProvider.matchReasons[0] || '';

  let response = `Great choice! For ${activity}${timeNote}, I recommend **${nameList}**.`;

  if (ranked.length === 1) {
    response = `For ${activity}${timeNote}, **${topProvider.name}** is your best match!`;
  }

  // Add a detail about the top pick
  if (topProvider.matchScore >= 80) {
    response += ` ${topProvider.name} is a ${topProvider.matchScore}% match — ${topReason.toLowerCase()}.`;
  } else if (topReason) {
    response += ` ${topProvider.name}: ${topReason.toLowerCase()}.`;
  }

  response += ' Check out their profiles below!';
  return response;
}

// ── Gemini conversational response (optional enhancement) ──────────────────

async function generateGeminiResponse(
  intent: ParsedIntent,
  ranked: RankedProvider[],
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string | null> {
  const apiKey = config.gemini.apiKey;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const providerSummary = ranked.slice(0, 3).map(p =>
      `- ${p.name} (${p.title}): ${p.matchScore}% match, $${p.price}/session, ${p.rating}★, specialises in ${p.matchedActivities.join(', ') || p.activities[0]}. Reasons: ${p.matchReasons.join(', ')}`
    ).join('\n');

    const prompt = `You are Kindora's friendly AI assistant. The user asked: "${intent.raw_query}"

We parsed their intent as: service_type="${intent.service_type}", time="${intent.time || 'flexible'}", budget=${intent.budget || 'any'}

Our matching engine found these top providers:
${providerSummary || 'No providers matched.'}

Write a SHORT, warm, conversational response (2-3 sentences max) that:
1. Acknowledges what they asked for
2. Names the top recommendation(s) and briefly explains WHY they're the best match
3. Invites them to check profiles

Do NOT make up information. Only reference providers listed above.
Keep it natural and friendly. No bullet points.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim();
    return text || null;
  } catch (err) {
    console.error('[ChatHandler] Gemini response generation failed:', err);
    return null;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

export class ChatRequestHandler {

  /**
   * Process a chat message end-to-end.
   *
   * Flow:
   *  1. Gemini → Parse intent
   *  2. Provider filter → Candidates
   *  3. Ranking engine → Scored results
   *  4. Generate response text
   */
  async handle(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    // Step 1: Parse intent (Gemini → fallback local)
    const intent = await geminiIntentService.parse(request.message);
    console.log(`[ChatHandler] Intent parsed in ${Date.now() - startTime}ms:`, JSON.stringify(intent));

    // Step 2: Filter providers
    const filterStart = Date.now();
    const candidates = await providerFilterService.search(intent);
    console.log(`[ChatHandler] Filtered to ${candidates.length} candidates in ${Date.now() - filterStart}ms`);

    // Step 3: Rank candidates
    const rankStart = Date.now();
    const ranked = rankingEngine.rank(candidates, intent, 10);
    console.log(`[ChatHandler] Ranked ${ranked.length} providers in ${Date.now() - rankStart}ms`);

    // Step 4: Generate response
    let response: string;

    // Try Gemini for a nicer conversational response
    const geminiResponse = await generateGeminiResponse(
      intent,
      ranked,
      request.conversationHistory || []
    );

    if (geminiResponse) {
      response = geminiResponse;
    } else {
      response = generateResponseText(intent, ranked);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[ChatHandler] Total processing time: ${totalTime}ms`);

    // Strip sensitive fields from recommendations
    const safeRecommendations = ranked.map(r => {
      const { availability, matchingProfile, ...safe } = r;
      return safe;
    });

    return {
      response,
      intent,
      recommendations: safeRecommendations as RankedProvider[],
      extractedPreferences: intent, // compat with existing frontend
    };
  }
}

export const chatRequestHandler = new ChatRequestHandler();
