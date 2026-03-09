import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create test users
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

  console.log('✅ Created user:', user1.name);

  // Create companions
  const companions = [
    {
      email: 'megan@companion.com',
      password: await hashPassword('password123'),
      name: 'Megan T.',
      title: 'Weekend Golf Companion',
      description: 'Relaxed pace, loves morning tee times, and great conversation on the course.',
      avatar: 'https://images.unsplash.com/photo-1718965018802-897e94ce7f15',
      location: 'San Francisco, CA',
      bio: 'I believe the best rounds of golf are the ones where the conversation is as good as the game. I play at a relaxed pace and enjoy getting to know people.',
      price: 45,
      rating: 4.9,
      reviewCount: 127,
      rebookRate: 94,
      responseTime: '< 30 min',
      sessionsCompleted: 312,
      verified: true,
      activities: ['Golf', 'Coffee Walk', 'Dog Park'],
      personality: ['relaxed', 'friendly', 'patient'],
      interests: ['golf', 'outdoors', 'conversation'],
      conversationStyle: ['balanced', 'listener'],
    },
    {
      email: 'james@companion.com',
      password: await hashPassword('password123'),
      name: 'James R.',
      title: 'Coffee Walk Partner',
      description: 'Easy-going listener, thoughtful, available weekday mornings.',
      avatar: 'https://images.unsplash.com/photo-1764816657425-b3c79b616d14',
      location: 'San Francisco, CA',
      bio: 'I love exploring the city on foot and having meaningful conversations over coffee. Available most mornings.',
      price: 35,
      rating: 5.0,
      reviewCount: 93,
      rebookRate: 97,
      responseTime: '< 20 min',
      sessionsCompleted: 186,
      verified: true,
      activities: ['Coffee Walk', 'Conversation', 'City Tours'],
      personality: ['thoughtful', 'calm', 'empathetic'],
      interests: ['coffee', 'walking', 'photography'],
      conversationStyle: ['listener', 'thoughtful'],
    },
    {
      email: 'lily@companion.com',
      password: await hashPassword('password123'),
      name: 'Lily C.',
      title: 'Kids Homework Mentor',
      description: 'Patient, encouraging, specializes in math & reading for ages 8–14.',
      avatar: 'https://images.unsplash.com/photo-1673623703556-eafc6dd91c54',
      location: 'San Francisco, CA',
      bio: 'Former teacher with a passion for helping kids succeed. Patient and creative approach to learning.',
      price: 40,
      rating: 4.8,
      reviewCount: 156,
      rebookRate: 91,
      responseTime: '< 1 hour',
      sessionsCompleted: 428,
      verified: true,
      activities: ['Homework Help', 'Reading', 'Math Tutoring'],
      personality: ['patient', 'encouraging', 'creative'],
      interests: ['education', 'reading', 'puzzles'],
      conversationStyle: ['encouraging', 'teacher'],
    },
  ];

  for (const companionData of companions) {
    const { activities, personality, interests, conversationStyle, ...companionInfo } = companionData;
    
    const companion = await prisma.companion.upsert({
      where: { email: companionData.email },
      update: {},
      create: companionInfo,
    });

    console.log('✅ Created companion:', companion.name);

    // Add activities
    for (const activity of activities) {
      await prisma.companionActivity.create({
        data: {
          companionId: companion.id,
          name: activity,
          category: 'General',
        },
      });
    }

    // Add availability (weekdays 9am-5pm)
    for (let day = 1; day <= 5; day++) {
      await prisma.companionAvailability.create({
        data: {
          companionId: companion.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '17:00',
        },
      });
    }

    // Add matching profile
    await prisma.companionMatchingProfile.create({
      data: {
        companionId: companion.id,
        personality,
        interests,
        conversationStyle,
        ageRange: '25-45',
        preferredTimes: ['morning', 'afternoon'],
      },
    });
  }

  // Create sample reviews
  const companionsInDb = await prisma.companion.findMany();
  
  const reviews = [
    {
      companionId: companionsInDb[0].id,
      userId: user1.id,
      rating: 5,
      comment: 'Megan made my first time golfing in years feel so comfortable. No judgment, just fun.',
    },
    {
      companionId: companionsInDb[1].id,
      userId: user1.id,
      rating: 5,
      comment: 'Great conversation and perfect morning walks. Highly recommend!',
    },
  ];

  for (const review of reviews) {
    await prisma.review.create({
      data: review,
    });
  }

  console.log('✅ Created sample reviews');

  // Create user preferences
  await prisma.userPreference.create({
    data: {
      userId: user1.id,
      interests: ['golf', 'coffee', 'walking'],
      personality: ['relaxed', 'friendly'],
      preferredTimes: ['morning', 'weekend'],
      preferredActivities: ['Golf', 'Coffee Walk'],
      budgetRange: '30-50',
    },
  });

  console.log('✅ Created user preferences');
  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
