import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { hashPassword } from './utils/password.js';

// Routes
import authRoutes from './routes/auth.js';
import companionsRoutes from './routes/companions.js';
import bookingsRoutes from './routes/bookings.js';
import reviewsRoutes from './routes/reviews.js';
import chatRoutes from './routes/chat.js';
import paymentsRoutes from './routes/payments.js';
import usersRoutes from './routes/users.js';

const app = express();

// Middleware
app.use(cors({
  origin: config.cors.allowedOrigins,
  credentials: true,
}));

// Stripe webhook needs raw body
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// JSON parser for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check - always responds
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// One-time seed endpoint
app.post('/api/seed', async (_req, res) => {
  try {
    const prisma = new PrismaClient();
    
    // Check if already seeded
    const existing = await prisma.companion.count();
    if (existing > 0) {
      await prisma.$disconnect();
      return res.json({ message: 'Already seeded', companions: existing });
    }

    // Create test user
    const user1 = await prisma.user.upsert({
      where: { email: 'john@example.com' },
      update: {},
      create: {
        email: 'john@example.com',
        password: await hashPassword('password123'),
        name: 'John Doe',
        phone: '+1234567890',
      },
    });

    const companionsData = [
      {
        email: 'megan@companion.com',
        name: 'Megan T.',
        title: 'Weekend Golf Companion',
        description: 'Relaxed pace, loves morning tee times, and great conversation on the course.',
        avatar: 'https://images.unsplash.com/photo-1718965018802-897e94ce7f15?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmllbmRseSUyMHdvbWFuJTIwcG9ydHJhaXQlMjB3YXJtJTIwc21pbGUlMjBvdXRkb29yfGVufDF8fHx8MTc3MjQzMjUzMXww&ixlib=rb-4.1.0&q=80&w=1080',
        location: 'San Francisco, CA',
        bio: 'I believe the best rounds of golf are the ones where the conversation is as good as the game. I play at a relaxed pace and enjoy getting to know people. Whether you are a scratch golfer or just starting out, I am here for good company first and birdie putts second.',
        price: 45,
        rating: 4.9,
        reviewCount: 127,
        rebookRate: 94,
        responseTime: '< 30 min',
        sessionsCompleted: 312,
        verified: true,
        activities: ['Golf (18 holes)', 'Driving Range', 'Coffee Walk', 'Dog Park'],
        personality: ['relaxed', 'friendly', 'patient'],
        interests: ['golf', 'outdoors', 'conversation'],
        conversationStyle: ['balanced', 'listener'],
      },
      {
        email: 'james@companion.com',
        name: 'James R.',
        title: 'Coffee Walk Partner',
        description: 'Easy-going listener, thoughtful, available weekday mornings.',
        avatar: 'https://images.unsplash.com/photo-1764816657425-b3c79b616d14?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmllbmRseSUyMG1hbiUyMHBvcnRyYWl0JTIwY2FzdWFsJTIwb3V0ZG9vciUyMHNtaWxlfGVufDF8fHx8MTc3MjQzMjUzMXww&ixlib=rb-4.1.0&q=80&w=1080',
        location: 'San Francisco, CA',
        bio: 'I love exploring the city on foot and having meaningful conversations over coffee. Whether it is a brisk morning walk or a leisurely afternoon stroll, I am all about genuine connection and good vibes.',
        price: 35,
        rating: 5.0,
        reviewCount: 93,
        rebookRate: 97,
        responseTime: '< 20 min',
        sessionsCompleted: 186,
        verified: true,
        activities: ['Coffee Walk', 'Conversation', 'City Tours', 'Dog Park'],
        personality: ['thoughtful', 'calm', 'empathetic'],
        interests: ['coffee', 'walking', 'photography'],
        conversationStyle: ['listener', 'thoughtful'],
      },
      {
        email: 'lily@companion.com',
        name: 'Lily C.',
        title: 'Conversation Partner',
        description: 'Warm, genuine, and curious. Perfect for afternoon tea or a quiet evening chat.',
        avatar: 'https://images.unsplash.com/photo-1673623703556-eafc6dd91c54?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhc2lhbiUyMHdvbWFuJTIwcG9ydHJhaXQlMjB3YXJtJTIwZnJpZW5kbHklMjBuYXR1cmFsfGVufDF8fHx8MTc3MjQzMjUzMnww&ixlib=rb-4.1.0&q=80&w=1080',
        location: 'San Francisco, CA',
        bio: 'Warm and genuine with a natural curiosity about people. I love deep conversations over tea, quiet evenings, and creating a safe space for authentic connection.',
        price: 40,
        rating: 4.8,
        reviewCount: 156,
        rebookRate: 91,
        responseTime: '< 1 hour',
        sessionsCompleted: 428,
        verified: true,
        activities: ['Conversation', 'Afternoon Tea', 'Reading Club', 'Walking'],
        personality: ['warm', 'genuine', 'curious'],
        interests: ['reading', 'tea', 'conversation'],
        conversationStyle: ['encouraging', 'warm'],
      },
      {
        email: 'robert@companion.com',
        name: 'Robert K.',
        title: 'Dog Park Buddy',
        description: 'Loves dogs of all sizes. Calm, friendly, enjoys morning walks.',
        avatar: 'https://images.unsplash.com/photo-1617746038583-9726a81f24b2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvbGRlciUyMG1hbiUyMHBvcnRyYWl0JTIwa2luZCUyMGdlbnRsZSUyMHNtaWxlfGVufDF8fHx8MTc3MjQzMjUzMnww&ixlib=rb-4.1.0&q=80&w=1080',
        location: 'San Francisco, CA',
        bio: 'Dog lover and morning person. I bring my golden retriever Max to the park every day. Great company for dog owners or anyone who just loves being around animals.',
        price: 30,
        rating: 4.9,
        reviewCount: 84,
        rebookRate: 93,
        responseTime: '< 45 min',
        sessionsCompleted: 215,
        verified: true,
        activities: ['Dog Park', 'Morning Walk', 'Coffee', 'Hiking'],
        personality: ['calm', 'friendly', 'outdoorsy'],
        interests: ['dogs', 'nature', 'hiking'],
        conversationStyle: ['easy-going', 'friendly'],
      },
      {
        email: 'sofia@companion.com',
        name: 'Sofia M.',
        title: 'Travel Companion',
        description: 'Adventurous spirit, great planner, experienced in weekend day trips.',
        avatar: 'https://images.unsplash.com/photo-1758467796950-1da4615c97b5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx5b3VuZyUyMHdvbWFuJTIwcG9ydHJhaXQlMjBuYXR1cmFsJTIwbGlnaHQlMjBoYXBweXxlbnwxfHx8fDE3NzI0MzI1MzJ8MA&ixlib=rb-4.1.0&q=80&w=1080',
        location: 'San Francisco, CA',
        bio: 'Adventure seeker and trip planner extraordinaire. I love discovering hidden gems, trying local food, and making every outing feel like a mini vacation.',
        price: 50,
        rating: 4.7,
        reviewCount: 68,
        rebookRate: 88,
        responseTime: '< 1 hour',
        sessionsCompleted: 142,
        verified: true,
        activities: ['Day Trips', 'Food Tours', 'Hiking', 'Photography'],
        personality: ['adventurous', 'energetic', 'organized'],
        interests: ['travel', 'food', 'photography'],
        conversationStyle: ['enthusiastic', 'storyteller'],
      },
    ];

    const createdCompanions = [];
    for (const data of companionsData) {
      const { activities, personality, interests, conversationStyle, ...info } = data;
      const companion = await prisma.companion.upsert({
        where: { email: data.email },
        update: {},
        create: {
          ...info,
          password: await hashPassword('password123'),
        },
      });
      createdCompanions.push(companion);

      for (const activity of activities) {
        await prisma.companionActivity.create({
          data: { companionId: companion.id, name: activity, category: 'General' },
        });
      }

      for (let day = 0; day <= 6; day++) {
        await prisma.companionAvailability.create({
          data: { companionId: companion.id, dayOfWeek: day, startTime: '08:00', endTime: '18:00' },
        });
      }

      await prisma.companionMatchingProfile.create({
        data: {
          companionId: companion.id,
          personality,
          interests,
          conversationStyle,
          ageRange: '25-55',
          preferredTimes: ['morning', 'afternoon', 'weekend'],
        },
      });
    }

    // Create reviews
    const reviewsData = [
      { companionIdx: 0, rating: 5, comment: 'Megan made my first time golfing in years feel so comfortable. No judgment, just fun.' },
      { companionIdx: 0, rating: 5, comment: 'We ended up chatting for an hour after our round! Already rebooked for next weekend.' },
      { companionIdx: 0, rating: 4, comment: 'Great companion. Very genuine and warm. Made the whole experience feel like hanging out with an old friend.' },
      { companionIdx: 1, rating: 5, comment: 'Best morning walk ever. James has this calming energy that makes conversation flow naturally.' },
      { companionIdx: 1, rating: 5, comment: 'Incredibly thoughtful and easy to talk to. Perfect coffee companion.' },
      { companionIdx: 2, rating: 5, comment: 'Lily is the warmest person I have met. Our tea sessions are the highlight of my week.' },
      { companionIdx: 2, rating: 4, comment: 'Such a genuine listener. I always feel better after our conversations.' },
      { companionIdx: 3, rating: 5, comment: 'Robert and Max are the best duo at the park! My dog loves them.' },
      { companionIdx: 4, rating: 5, comment: 'Sofia planned the most amazing day trip to Half Moon Bay. Unforgettable!' },
    ];

    for (const r of reviewsData) {
      await prisma.review.create({
        data: {
          companionId: createdCompanions[r.companionIdx].id,
          userId: user1.id,
          rating: r.rating,
          comment: r.comment,
        },
      });
    }

    await prisma.$disconnect();
    res.json({ message: 'Seed completed', companions: createdCompanions.length, reviews: reviewsData.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/companions', companionsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/users', usersRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = config.port;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
});

export default app;
