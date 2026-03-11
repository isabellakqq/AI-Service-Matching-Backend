import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

const geminiApiKey = config.gemini.apiKey;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

export interface MatchingCriteria {
  interests?: string[];
  personality?: string[];
  preferredTimes?: string[];
  activity?: string;
  budget?: number;
}

export interface CompanionScore {
  companionId: string;
  score: number;
  reasons: string[];
}

const ACTIVITY_KEYWORDS: Record<string, string[]> = {
  golf: ['golf', 'driving range', 'tee time', 'course', '18 holes'],
  coffee: ['coffee', 'cafe', 'latte', 'espresso', 'morning drink'],
  walk: ['walk', 'walking', 'stroll', 'hike', 'hiking', 'outdoor'],
  dog: ['dog', 'puppy', 'pet', 'animal', 'dog park'],
  conversation: ['talk', 'chat', 'conversation', 'discuss', 'listen', 'company'],
  tea: ['tea', 'afternoon tea'],
  reading: ['read', 'book', 'reading', 'literature'],
  cooking: ['cook', 'cooking', 'bake', 'kitchen', 'recipe', 'food'],
  city: ['city', 'tour', 'explore', 'sightseeing', 'downtown'],
};

const TIME_KEYWORDS: Record<string, string[]> = {
  morning: ['morning', 'am', 'early', 'sunrise', 'breakfast'],
  afternoon: ['afternoon', 'lunch', 'midday', 'noon'],
  evening: ['evening', 'night', 'dinner', 'sunset', 'pm'],
  weekend: ['weekend', 'saturday', 'sunday'],
  weekday: ['weekday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
};

export class AIMatchingService {
  calculateMatchScore(userPrefs: MatchingCriteria, companion: any): CompanionScore {
    let score = 0;
    const reasons: string[] = [];
    const maxScore = 100;

    if (userPrefs.budget) {
      if (companion.price <= userPrefs.budget) {
        const priceScore = 20 * (1 - (companion.price / userPrefs.budget) * 0.5);
        score += priceScore;
        reasons.push('Within your budget');
      }
    } else {
      score += 15;
    }

    if (userPrefs.interests && userPrefs.interests.length > 0) {
      const companionActivities = (companion.activities || []).map((a: any) =>
        (typeof a === 'string' ? a : a.name || '').toLowerCase()
      );
      const companionDesc = ((companion.description || '') + ' ' + (companion.title || '')).toLowerCase();
      const profileInterests = (companion.matchingProfile?.interests || []).map((i: string) => i.toLowerCase());
      const allText = [...companionActivities, ...profileInterests, companionDesc].join(' ');

      const matched = userPrefs.interests.filter((interest: string) =>
        allText.includes(interest.toLowerCase())
      );
      const interestScore = (matched.length / userPrefs.interests.length) * 30;
      score += interestScore;
      if (matched.length > 0) {
        reasons.push('Matches: ' + matched.join(', '));
      }
    } else {
      score += 15;
    }

    if (userPrefs.personality && companion.matchingProfile?.personality) {
      const commonTraits = userPrefs.personality.filter((p: string) =>
        companion.matchingProfile.personality.some((cp: string) =>
          cp.toLowerCase().includes(p.toLowerCase())
        )
      );
      const personalityScore = (commonTraits.length / userPrefs.personality.length) * 25;
      score += personalityScore;
      if (commonTraits.length > 0) {
        reasons.push('Personality: ' + commonTraits.join(', '));
      }
    } else {
      score += 12;
    }

    if (userPrefs.preferredTimes && companion.matchingProfile?.preferredTimes) {
      const commonTimes = userPrefs.preferredTimes.filter((t: string) =>
        companion.matchingProfile.preferredTimes.some((ct: string) =>
          ct.toLowerCase().includes(t.toLowerCase())
        )
      );
      const timeScore = (commonTimes.length / userPrefs.preferredTimes.length) * 15;
      score += timeScore;
      if (commonTimes.length > 0) {
        reasons.push('Available at your preferred times');
      }
    } else {
      score += 7;
    }

    const ratingBonus = (companion.rating / 5) * 10;
    score += ratingBonus;
    if (companion.rating >= 4.5) {
      reasons.push('Highly rated');
    }

    return {
      companionId: companion.id,
      score: Math.min(Math.round(score), maxScore),
      reasons,
    };
  }

  async getRecommendations(
    companions: any[],
    userPrefs: MatchingCriteria
  ): Promise<CompanionScore[]> {
    const scores = companions.map(companion =>
      this.calculateMatchScore(userPrefs, companion)
    );
    return scores.sort((a, b) => b.score - a.score);
  }

  private extractPreferencesLocal(userMessage: string): MatchingCriteria {
    const msg = userMessage.toLowerCase();
    const interests: string[] = [];
    const preferredTimes: string[] = [];
    let activity: string | undefined;

    for (const [activityName, keywords] of Object.entries(ACTIVITY_KEYWORDS)) {
      if (keywords.some(kw => msg.includes(kw))) {
        interests.push(activityName);
        if (!activity) activity = activityName;
      }
    }

    for (const [timeName, keywords] of Object.entries(TIME_KEYWORDS)) {
      if (keywords.some(kw => msg.includes(kw))) {
        preferredTimes.push(timeName);
      }
    }

    let budget: number | undefined;
    const budgetMatch = msg.match(/\$(\d+)/);
    if (budgetMatch) {
      budget = parseInt(budgetMatch[1]);
    }

    const result: MatchingCriteria = {};
    if (interests.length > 0) result.interests = interests;
    if (preferredTimes.length > 0) result.preferredTimes = preferredTimes;
    if (activity) result.activity = activity;
    if (budget) result.budget = budget;
    return result;
  }

  private generateLocalResponse(
    userMessage: string,
    companions: any[],
    preferences: MatchingCriteria
  ): string {
    const msg = userMessage.toLowerCase();

    if (/^(hi|hello|hey|howdy)\b/.test(msg)) {
      return "Hey there! I would love to help you find the perfect companion. What kind of activity are you interested in? We have companions for golf, coffee walks, dog parks, conversations, cooking, and more!";
    }

    if (/\b(thanks|thank you|thx)\b/.test(msg)) {
      return "You are welcome! Feel free to ask anytime. I am here to help you find the right match!";
    }

    if (preferences.interests && preferences.interests.length > 0) {
      const activityNames = preferences.interests.join(' and ');
      const matched = companions.filter(c => {
        const activities = (c.activities || []).map((a: any) =>
          (typeof a === 'string' ? a : a.name || '').toLowerCase()
        );
        const desc = ((c.description || '') + ' ' + (c.title || '')).toLowerCase();
        return preferences.interests!.some(interest =>
          activities.some((a: string) => a.includes(interest)) || desc.includes(interest)
        );
      });

      if (matched.length > 0) {
        const names = matched.slice(0, 3).map(c => c.name).join(', ');
        const timeNote = preferences.preferredTimes?.length
          ? ' for ' + preferences.preferredTimes.join('/') + ' sessions'
          : '';
        return 'Great choice! For ' + activityNames + timeNote + ', I would recommend ' + names + '. They are all highly rated and experienced. Check out their profiles below to see who fits best!';
      } else {
        return 'I see you are interested in ' + activityNames + '! While I do not have an exact match for that specific activity, our companions are versatile and open to various activities. Browse the profiles below!';
      }
    }

    if (/\b(price|cost|how much|expensive|cheap|budget|afford)\b/.test(msg)) {
      const prices = companions.map(c => c.price).filter(Boolean);
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        return 'Our companions range from $' + min + ' to $' + max + ' per session. Most sessions are about 1-2 hours. Would you like me to help you find someone within a specific budget?';
      }
      return 'Our companions offer various pricing options. Tell me what activity you are interested in and I will find options that work for you!';
    }

    if (/\b(how.*work|what.*do|explain|about)\b/.test(msg)) {
      return 'Here is how it works: Tell me what activity you would like (golf, coffee walks, conversation, etc.), I will match you with compatible companions, you can view their profiles, reviews, and availability, then book a session! What activity interests you?';
    }

    return 'I would love to help you find a companion! Could you tell me more about what you are looking for? For example: What activity? (golf, coffee walk, conversation, cooking...), Any time preference? (mornings, weekends...), or a budget range?';
  }

  async generateChatResponse(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    companions?: any[]
  ): Promise<string> {
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const companionContext = companions && companions.length > 0
          ? '\n\nAvailable companions:\n' + companions.map(c => {
              const activities = (c.activities || []).map((a: any) => typeof a === 'string' ? a : a.name).join(', ');
              return '- ' + c.name + ' (' + c.title + '): ' + activities + ', $' + c.price + '/session, rating ' + c.rating;
            }).join('\n')
          : '';

        const systemPrompt = 'You are a friendly AI assistant for Kindora AI, helping users find the perfect companion for activities like golf, coffee walks, conversations, dog park visits, and more. Be warm, conversational, and helpful. Keep responses concise (2-3 sentences). When recommending companions, reference them by name.' + companionContext;

        const historyText = conversationHistory.map(h => h.role + ': ' + h.content).join('\n');
        const fullPrompt = systemPrompt + '\n\nConversation:\n' + historyText + '\nUser: ' + userMessage + '\nAssistant:';

        const result = await model.generateContent(fullPrompt);
        const text = result.response.text();
        if (text) return text;
      } catch (error) {
        console.error('Gemini API error, using local fallback:', error);
      }
    }

    const preferences = this.extractPreferencesLocal(userMessage);
    return this.generateLocalResponse(userMessage, companions || [], preferences);
  }

  async extractPreferences(userMessage: string): Promise<MatchingCriteria> {
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = 'Extract preferences from: "' + userMessage + '". Return ONLY valid JSON with optional fields: interests(string[]), personality(string[]), preferredTimes(string[]), activity(string), budget(number). Example: {"interests":["golf"],"preferredTimes":["weekend"]}';
        const result = await model.generateContent(prompt);
        const content = result.response.text() || '{}';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } catch (error) {
        console.error('Gemini extractPreferences error, using local fallback:', error);
      }
    }

    return this.extractPreferencesLocal(userMessage);
  }
}

export const aiMatchingService = new AIMatchingService();
