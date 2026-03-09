import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../db/client.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// Get reviews for a companion
router.get('/:companionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companionId } = req.params;

    const reviews = await prisma.review.findMany({
      where: { companionId },
      include: {
        user: {
          select: {
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      reviews: reviews.map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        userName: r.user.name,
        userAvatar: r.user.avatar,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Create review
router.post(
  '/',
  authenticate,
  [
    body('companionId').notEmpty().withMessage('Companion ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().isString(),
  ],
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        throw new ApiError(401, 'Unauthorized');
      }

      const { companionId, rating, comment } = req.body;

      // Create review
      const review = await prisma.review.create({
        data: {
          userId: req.user.userId,
          companionId,
          rating,
          comment,
        },
        include: {
          user: {
            select: {
              name: true,
              avatar: true,
            },
          },
        },
      });

      // Update companion's average rating and review count
      const allReviews = await prisma.review.findMany({
        where: { companionId },
        select: { rating: true },
      });

      const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

      await prisma.companion.update({
        where: { id: companionId },
        data: {
          rating: Math.round(avgRating * 10) / 10,
          reviewCount: allReviews.length,
        },
      });

      res.status(201).json({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        userName: review.user.name,
        userAvatar: review.user.avatar,
        createdAt: review.createdAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
