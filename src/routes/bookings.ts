import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../db/client.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { BookingStatus } from '@prisma/client';

const router = Router();

// Get user's bookings
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized');
    }

    const { status } = req.query;

    const where: any = {
      userId: req.user.userId,
    };

    if (status) {
      where.status = status as BookingStatus;
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        companion: {
          select: {
            id: true,
            name: true,
            title: true,
            avatar: true,
            rating: true,
          },
        },
      },
      orderBy: { scheduledAt: 'desc' },
    });

    res.json({
      bookings: bookings.map(b => ({
        id: b.id,
        status: b.status,
        activity: b.activity,
        location: b.location,
        scheduledAt: b.scheduledAt,
        duration: b.duration,
        price: b.price,
        notes: b.notes,
        companion: b.companion,
        createdAt: b.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Create booking
router.post(
  '/',
  authenticate,
  [
    body('companionId').notEmpty().withMessage('Companion ID is required'),
    body('activity').notEmpty().withMessage('Activity is required'),
    body('scheduledAt').isISO8601().withMessage('Invalid date format'),
    body('duration').isInt({ min: 30 }).withMessage('Duration must be at least 30 minutes'),
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

      const { companionId, activity, location, scheduledAt, duration, notes } = req.body;

      // Get companion
      const companion = await prisma.companion.findUnique({
        where: { id: companionId },
      });

      if (!companion) {
        throw new ApiError(404, 'Companion not found');
      }

      // Calculate price based on duration
      const hours = duration / 60;
      const price = companion.price * hours;

      // Create booking
      const booking = await prisma.booking.create({
        data: {
          userId: req.user.userId,
          companionId,
          activity,
          location,
          scheduledAt: new Date(scheduledAt),
          duration,
          price,
          notes,
          status: 'PENDING',
        },
        include: {
          companion: {
            select: {
              id: true,
              name: true,
              title: true,
              avatar: true,
              rating: true,
            },
          },
        },
      });

      res.status(201).json(booking);
    } catch (error) {
      next(error);
    }
  }
);

// Update booking status
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized');
    }

    const { id } = req.params;
    const { status } = req.body;

    // Verify booking belongs to user
    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    if (booking.userId !== req.user.userId) {
      throw new ApiError(403, 'Forbidden');
    }

    // Update booking
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: { status },
      include: {
        companion: {
          select: {
            id: true,
            name: true,
            title: true,
            avatar: true,
          },
        },
      },
    });

    res.json(updatedBooking);
  } catch (error) {
    next(error);
  }
});

// Cancel booking
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized');
    }

    const { id } = req.params;

    // Verify booking belongs to user
    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    if (booking.userId !== req.user.userId) {
      throw new ApiError(403, 'Forbidden');
    }

    // Update status to cancelled
    await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
