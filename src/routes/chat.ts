import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../db/client.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { aiMatchingService } from '../services/aiMatching.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// AI Chat endpoint
router.post(
  '/ai',
  authenticate,
  [
    body('message').notEmpty().withMessage('Message is required'),
  ],
  async (req: AuthRequest, res: Response, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        throw new ApiError(401, 'Unauthorized');
      }

      const { message, conversationHistory = [] } = req.body;

      // Get companions for context
      const companions = await prisma.companion.findMany({
        where: { active: true },
        include: {
          activities: true,
          matchingProfile: true,
        },
        take: 10,
        orderBy: { rating: 'desc' },
      });

      // Generate AI response
      const aiResponse = await aiMatchingService.generateChatResponse(
        message,
        conversationHistory,
        companions
      );

      // Extract preferences from user message
      const preferences = await aiMatchingService.extractPreferences(message);

      // Get recommendations if preferences found
      let recommendations = [];
      if (Object.keys(preferences).length > 0) {
        const scores = await aiMatchingService.getRecommendations(companions, preferences);
        recommendations = scores.slice(0, 3).map(s => {
          const companion = companions.find(c => c.id === s.companionId);
          return {
            ...companion,
            matchScore: s.score,
            matchReasons: s.reasons,
          };
        });
      }

      // Save message to database
      await prisma.message.create({
        data: {
          senderId: req.user.userId,
          content: message,
          type: 'TEXT',
          isAI: false,
        },
      });

      await prisma.message.create({
        data: {
          content: aiResponse,
          type: 'TEXT',
          isAI: true,
        },
      });

      res.json({
        response: aiResponse,
        recommendations,
        extractedPreferences: preferences,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get messages with a companion
router.get('/messages/:companionId', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized');
    }

    const { companionId } = req.params;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: req.user.userId, companionId },
          { companionId, receiverId: req.user.userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

// Send message to companion
router.post(
  '/messages',
  authenticate,
  [
    body('companionId').notEmpty().withMessage('Companion ID is required'),
    body('content').notEmpty().withMessage('Content is required'),
  ],
  async (req: AuthRequest, res: Response, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        throw new ApiError(401, 'Unauthorized');
      }

      const { companionId, content } = req.body;

      const message = await prisma.message.create({
        data: {
          senderId: req.user.userId,
          companionId,
          content,
          type: 'TEXT',
          isAI: false,
        },
      });

      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
