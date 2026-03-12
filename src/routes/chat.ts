import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../db/client.js';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth.js';
import { chatRequestHandler } from '../ai/chatHandler.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// AI Chat endpoint (modular pipeline)
// Flow: Message -> Gemini Intent -> Provider Filter -> Ranking -> Response
router.post(
  '/ai',
  optionalAuthenticate,
  [
    body('message').notEmpty().withMessage('Message is required'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { message, conversationHistory = [] } = req.body;

      const result = await chatRequestHandler.handle({
        message,
        conversationHistory,
        userId: req.user?.userId,
      });

      if (req.user) {
        await prisma.message.create({
          data: { senderId: req.user.userId, content: message, type: 'TEXT', isAI: false },
        });
        await prisma.message.create({
          data: { content: result.response, type: 'TEXT', isAI: true },
        });
      }

      res.json({
        response: result.response,
        recommendations: result.recommendations,
        extractedPreferences: result.extractedPreferences,
        intent: result.intent,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Provider search endpoint (direct, no chat)
router.post(
  '/search',
  optionalAuthenticate,
  [
    body('query').notEmpty().withMessage('Query is required'),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { query, conversationHistory = [] } = req.body;

      const result = await chatRequestHandler.handle({
        message: query,
        conversationHistory,
        userId: req.user?.userId,
      });

      res.json({
        providers: result.recommendations,
        intent: result.intent,
        total: result.recommendations.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get messages with a companion
router.get('/messages/:companionId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, 'Unauthorized');

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
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) throw new ApiError(401, 'Unauthorized');

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
