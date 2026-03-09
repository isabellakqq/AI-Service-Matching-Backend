import { Router, Request, Response } from 'express';
import { query } from 'express-validator';
import prisma from '../db/client.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// Get all companions
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const { search, minRating, maxPrice, activity } = req.query;

    const where: any = {
      active: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (minRating) {
      where.rating = { gte: parseFloat(minRating as string) };
    }

    if (maxPrice) {
      where.price = { lte: parseFloat(maxPrice as string) };
    }

    const companions = await prisma.companion.findMany({
      where,
      include: {
        activities: true,
        _count: {
          select: { reviews: true },
        },
      },
      orderBy: [
        { rating: 'desc' },
        { reviewCount: 'desc' },
      ],
    });

    // Filter by activity if specified
    let filteredCompanions = companions;
    if (activity) {
      filteredCompanions = companions.filter(c =>
        c.activities.some(a => a.name.toLowerCase().includes((activity as string).toLowerCase()))
      );
    }

    res.json({
      companions: filteredCompanions.map(c => ({
        id: c.id,
        name: c.name,
        title: c.title,
        description: c.description,
        avatar: c.avatar,
        location: c.location,
        price: c.price,
        rating: c.rating,
        reviewCount: c.reviewCount,
        rebookRate: c.rebookRate,
        verified: c.verified,
        activities: c.activities.map(a => a.name),
        sessionsCompleted: c.sessionsCompleted,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get companion by ID
router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const companion = await prisma.companion.findUnique({
      where: { id },
      include: {
        activities: true,
        availability: true,
        matchingProfile: true,
        reviews: {
          include: {
            user: {
              select: {
                name: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!companion) {
      throw new ApiError(404, 'Companion not found');
    }

    res.json({
      id: companion.id,
      name: companion.name,
      title: companion.title,
      description: companion.description,
      bio: companion.bio,
      avatar: companion.avatar,
      location: companion.location,
      price: companion.price,
      rating: companion.rating,
      reviewCount: companion.reviewCount,
      rebookRate: companion.rebookRate,
      responseTime: companion.responseTime,
      sessionsCompleted: companion.sessionsCompleted,
      memberSince: companion.memberSince,
      verified: companion.verified,
      activities: companion.activities.map(a => ({
        id: a.id,
        name: a.name,
        category: a.category,
      })),
      availability: companion.availability,
      matchingProfile: companion.matchingProfile,
      reviews: companion.reviews.map(r => ({
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

// Get companion availability
router.get('/:id/availability', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const availability = await prisma.companionAvailability.findMany({
      where: { companionId: id },
      orderBy: { dayOfWeek: 'asc' },
    });

    res.json({ availability });
  } catch (error) {
    next(error);
  }
});

export default router;
