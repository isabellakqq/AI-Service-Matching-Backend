import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

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

    if (userPrefs.interests && companion.matchingProfile?.interests) {
      const commonInterests = userPrefs.interests.filter((i: string) =>
        companion.matchingProfile.interests.some((ci: string) =>
          ci.toLowerCase().includes(i.toLowerCase())
        )
      );
      const interestScore = (commonInterests.length / userPrefs.interests.length) * 30;
      score += interestScore;
      if (commonInterests.length > 0) {
        reasons.push(`Shared interests: ${commonInterests.join(', ')}`);
      }
    } else {
      score += 15;
    }

    if (userPrefs.personality && companion.matchingProfile?.personality) {
      const commonTraits = userPrefs.personality.filter((p: string) =>
        companion.matchingProfile.personality.includes(p)
      );
      const personalityScore = (commonTraits.length / userPrefs.personality.length) * 25;
      score += personalityScore;
      if (commonTraits.length > 0) {
        reasons.push(`Matching personality: ${commonTraits.join(', ')}`);
      }
    } else {
      score += 12;
    }

    if (userPrefs.preferredTimes && companion.matchingProfile?.preferredTimes) {
      const commonTimes = userPrefs.preferredTimes.filter((t: string) =>
        companion.matchingProfile.preferredTimes.includes(t)
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
      reasons.push('Highly rated by others');
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

  async generateChatResponse(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    companions?: any[]
  ): Promise<string> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const systemPrompt = 'You are a friendly AI assistant helping users find the perfect companion for various activities. Be warm, conversational, and helpful. Keep responses concise.';
      const historyText = conversationHistory.map(h => `${h.role}: ${h.content}`).join('\n');
      const fullPrompt = `${systemPrompt}\n\nConversation:\n${historyText}\nUser: ${userMessage}\nAssistant:`;
      const result = await model.generateContent(fullPrompt);
      return result.response.text() || "I'm here to help you find the perfect companion!";
    } catch (error) {
      console.error('Gemini API error:', error);
      return "I'm having trouble processing that right now. Could you try rephrasing?";
    }
  }

  async extractPreferences(userMessage: string): Promise<MatchingCriteria> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `Extract preferences from: "${userMessage}". Return ONLY valid JSON with optional fields: interests(string[]), personality(string[]), preferredTimes(string[]), activity(string), budget(number). Example: {"interests":["golf"],"preferredTimes":["weekend"]}`;
      const result = await model.generateContent(prompt);
      const content = result.response.text() || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch (error) {
      console.error('Error extracting preferences:', error);
      return {};
    }
  }
}

export const aiMatchingService = new AIMatchingService();
