import { Router, Request, Response } from 'express';
import prisma from '../db/client.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// Get user profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        preferences: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        role: true,
        preferences: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.patch(
  '/profile',
  authenticate,
  [
    body('name').optional().isString(),
    body('phone').optional().isString(),
    body('avatar').optional().isURL(),
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

      const { name, phone, avatar } = req.body;

      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: {
          ...(name && { name }),
          ...(phone && { phone }),
          ...(avatar && { avatar }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatar: true,
          role: true,
        },
      });

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

// Update user preferences
router.put(
  '/preferences',
  authenticate,
  [
    body('interests').optional().isArray(),
    body('personality').optional().isArray(),
    body('preferredTimes').optional().isArray(),
    body('preferredActivities').optional().isArray(),
    body('budgetRange').optional().isString(),
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

      const { interests, personality, preferredTimes, preferredActivities, budgetRange } = req.body;

      const preferences = await prisma.userPreference.upsert({
        where: { userId: req.user.userId },
        update: {
          ...(interests && { interests }),
          ...(personality && { personality }),
          ...(preferredTimes && { preferredTimes }),
          ...(preferredActivities && { preferredActivities }),
          ...(budgetRange && { budgetRange }),
        },
        create: {
          userId: req.user.userId,
          interests: interests || [],
          personality: personality || [],
          preferredTimes: preferredTimes || [],
          preferredActivities: preferredActivities || [],
          budgetRange,
        },
      });

      res.json(preferences);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
