# API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

---

## Endpoints

### Authentication

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER"
  },
  "token": "jwt-token"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>
```

---

### Companions

#### Get All Companions
```http
GET /companions?search=golf&minRating=4.5&maxPrice=50&activity=golf
```

**Query Parameters:**
- `search` - Search in name, title, description
- `minRating` - Minimum rating (0-5)
- `maxPrice` - Maximum price per hour
- `activity` - Filter by activity name

**Response:**
```json
{
  "companions": [
    {
      "id": "uuid",
      "name": "Megan T.",
      "title": "Weekend Golf Companion",
      "description": "...",
      "avatar": "url",
      "location": "San Francisco, CA",
      "price": 45,
      "rating": 4.9,
      "reviewCount": 127,
      "rebookRate": 94,
      "verified": true,
      "activities": ["Golf", "Coffee Walk"],
      "sessionsCompleted": 312
    }
  ]
}
```

#### Get Companion Details
```http
GET /companions/:id
```

**Response includes:**
- Full companion profile
- Activities
- Availability schedule
- Matching profile
- Recent reviews

#### Get Companion Availability
```http
GET /companions/:id/availability
```

---

### Bookings

#### Get User Bookings
```http
GET /bookings?status=PENDING
Authorization: Bearer <token>
```

**Query Parameters:**
- `status` - Filter by status: PENDING, CONFIRMED, COMPLETED, CANCELLED

#### Create Booking
```http
POST /bookings
Authorization: Bearer <token>
Content-Type: application/json

{
  "companionId": "uuid",
  "activity": "Golf - 18 holes",
  "location": "Presidio Golf Course",
  "scheduledAt": "2024-03-15T09:00:00Z",
  "duration": 180,
  "notes": "Looking forward to a relaxed game"
}
```

#### Update Booking Status
```http
PATCH /bookings/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "CONFIRMED"
}
```

#### Cancel Booking
```http
DELETE /bookings/:id
Authorization: Bearer <token>
```

---

### Reviews

#### Get Companion Reviews
```http
GET /reviews/:companionId
```

#### Create Review
```http
POST /reviews
Authorization: Bearer <token>
Content-Type: application/json

{
  "companionId": "uuid",
  "rating": 5,
  "comment": "Amazing experience! Highly recommend."
}
```

---

### Chat (AI Assistant)

#### Send Message to AI
```http
POST /chat/ai
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Looking for a golf buddy this weekend",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Hi!"
    },
    {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    }
  ]
}
```

**Response:**
```json
{
  "response": "I found 3 companions who match your needs...",
  "recommendations": [
    {
      "id": "uuid",
      "name": "Megan T.",
      "matchScore": 94,
      "matchReasons": ["Similar pace", "Weekend availability"]
    }
  ],
  "extractedPreferences": {
    "interests": ["golf"],
    "preferredTimes": ["weekend"]
  }
}
```

#### Get Messages with Companion
```http
GET /chat/messages/:companionId
Authorization: Bearer <token>
```

#### Send Message to Companion
```http
POST /chat/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "companionId": "uuid",
  "content": "Hi! Looking forward to our session"
}
```

---

### Payments

#### Create Payment Intent
```http
POST /payments/create-intent
Authorization: Bearer <token>
Content-Type: application/json

{
  "bookingId": "uuid"
}
```

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentId": "uuid"
}
```

#### Get Payment Status
```http
GET /payments/:bookingId
Authorization: Bearer <token>
```

#### Stripe Webhook
```http
POST /payments/webhook
Stripe-Signature: <signature>
Content-Type: application/json
```

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error message"
}
```

**Status Codes:**
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Matching Algorithm

The AI matching system scores companions based on:

1. **Price Compatibility (20 points)** - Within user's budget
2. **Interests Overlap (30 points)** - Shared hobbies/activities
3. **Personality Match (25 points)** - Compatible traits
4. **Time Availability (15 points)** - Schedule alignment
5. **Rating Bonus (10 points)** - High ratings from others

**Match Score:** 0-100 (higher is better)

---

## Rate Limiting

- 100 requests per 15 minutes per IP
- 1000 requests per day per user

---

## Webhooks

### Stripe Events Handled:
- `payment_intent.succeeded` - Updates payment and booking status
- `payment_intent.payment_failed` - Marks payment as failed

Configure webhook URL in Stripe Dashboard:
```
https://your-domain.com/api/payments/webhook
```
