import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { body, validationResult } from 'express-validator';
import prisma from '../db/client.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

const stripe = new Stripe(config.stripe.secretKey);

const router = Router();

// Create payment intent
router.post(
  '/create-intent',
  authenticate,
  [
    body('bookingId').notEmpty().withMessage('Booking ID is required'),
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

      const { bookingId } = req.body;

      // Get booking
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          companion: true,
        },
      });

      if (!booking) {
        throw new ApiError(404, 'Booking not found');
      }

      if (booking.userId !== req.user.userId) {
        throw new ApiError(403, 'Forbidden');
      }

      // Check if payment already exists
      const existingPayment = await prisma.payment.findUnique({
        where: { bookingId },
      });

      if (existingPayment && existingPayment.status === 'succeeded') {
        throw new ApiError(400, 'Payment already completed');
      }

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(booking.price * 100), // Convert to cents
        currency: 'usd',
        metadata: {
          bookingId: booking.id,
          userId: req.user.userId,
          companionId: booking.companionId,
        },
        description: `Payment for ${booking.activity} with ${booking.companion.name}`,
      });

      // Create or update payment record
      const payment = await prisma.payment.upsert({
        where: { bookingId },
        create: {
          userId: req.user.userId,
          bookingId,
          amount: booking.price,
          stripePaymentId: paymentIntent.id,
          status: 'pending',
        },
        update: {
          stripePaymentId: paymentIntent.id,
          status: 'pending',
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentId: payment.id,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Stripe webhook handler
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    res.status(400).send('No signature');
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe.webhookSecret
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      // Update payment status
      await prisma.payment.updateMany({
        where: { stripePaymentId: paymentIntent.id },
        data: { status: 'succeeded' },
      });

      // Update booking status to confirmed
      const payment = await prisma.payment.findFirst({
        where: { stripePaymentId: paymentIntent.id },
      });

      if (payment) {
        await prisma.booking.update({
          where: { id: payment.bookingId },
          data: { status: 'CONFIRMED' },
        });
      }
      break;

    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object as Stripe.PaymentIntent;
      
      await prisma.payment.updateMany({
        where: { stripePaymentId: failedIntent.id },
        data: { status: 'failed' },
      });
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Get payment status
router.get('/:bookingId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Unauthorized');
    }

    const { bookingId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { bookingId },
    });

    if (!payment) {
      throw new ApiError(404, 'Payment not found');
    }

    if (payment.userId !== req.user.userId) {
      throw new ApiError(403, 'Forbidden');
    }

    res.json(payment);
  } catch (error) {
    next(error);
  }
});

export default router;
