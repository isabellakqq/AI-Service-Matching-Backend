# Deployment Guide

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database
- OpenAI API key
- Stripe account (for payments)
- Domain with SSL certificate (for production)

---

## Environment Setup

1. **Clone and Install**
```bash
git clone <your-repo>
cd ai-service-matching-backend
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
DATABASE_URL="postgresql://user:password@host:5432/dbname"
JWT_SECRET="your-secure-random-secret-key"
OPENAI_API_KEY="sk-your-openai-key"
STRIPE_SECRET_KEY="sk_live_your-stripe-key"
STRIPE_WEBHOOK_SECRET="whsec_your-webhook-secret"
PORT=3000
NODE_ENV="production"
ALLOWED_ORIGINS="https://yourdomain.com"
```

3. **Database Setup**
```bash
# Generate Prisma Client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

---

## Development

```bash
npm run dev
```

Server runs on http://localhost:3000

---

## Production Deployment

### Option 1: Traditional Server (VPS/EC2)

1. **Build the project**
```bash
npm run build
```

2. **Start with PM2**
```bash
npm install -g pm2
pm2 start dist/server.js --name "ai-matching-api"
pm2 save
pm2 startup
```

3. **Nginx Configuration**
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

4. **SSL with Let's Encrypt**
```bash
sudo certbot --nginx -d api.yourdomain.com
```

---

### Option 2: Docker

1. **Create Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

2. **Create docker-compose.yml**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=ai_matching
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

3. **Deploy**
```bash
docker-compose up -d
```

---

### Option 3: Cloud Platforms

#### **Vercel/Railway/Render**

1. Connect your GitHub repository
2. Set environment variables in dashboard
3. Deploy automatically on push

#### **AWS Elastic Beanstalk**

```bash
eb init
eb create production
eb deploy
```

#### **Google Cloud Run**

```bash
gcloud builds submit --tag gcr.io/PROJECT-ID/ai-matching-api
gcloud run deploy --image gcr.io/PROJECT-ID/ai-matching-api
```

---

## Database Management

### Migrations
```bash
# Create new migration
npx prisma migrate dev --name add_new_feature

# Apply migrations in production
npx prisma migrate deploy
```

### Backup
```bash
# Backup database
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

---

## Monitoring

### Health Check Endpoint
```
GET /health
```

Returns:
```json
{
  "status": "ok",
  "timestamp": "2024-03-08T12:00:00Z"
}
```

### Logging

Use PM2 for logs:
```bash
pm2 logs ai-matching-api
pm2 logs ai-matching-api --lines 100
```

### Error Tracking

Integrate Sentry:
```bash
npm install @sentry/node
```

Add to `server.ts`:
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

---

## Security Checklist

- [ ] Use strong JWT_SECRET (32+ characters)
- [ ] Enable HTTPS/SSL
- [ ] Set proper CORS origins
- [ ] Use environment variables for secrets
- [ ] Enable rate limiting
- [ ] Validate all inputs
- [ ] Hash passwords with bcrypt
- [ ] Keep dependencies updated
- [ ] Use security headers (helmet)
- [ ] Enable database connection pooling
- [ ] Set up firewall rules
- [ ] Use prepared statements (Prisma handles this)

---

## Performance Optimization

1. **Database Indexing**
```sql
CREATE INDEX idx_companions_rating ON companions(rating);
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
```

2. **Caching (Redis)**
```bash
npm install redis
```

3. **Connection Pooling**
Already configured in Prisma

4. **CDN for Static Assets**
Use CloudFlare or AWS CloudFront

---

## Stripe Webhook Setup

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://api.yourdomain.com/api/payments/webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. Copy webhook secret to `.env`

---

## Troubleshooting

### Database Connection Issues
```bash
# Test connection
npx prisma db push
```

### Port Already in Use
```bash
lsof -ti:3000 | xargs kill -9
```

### Prisma Client Issues
```bash
rm -rf node_modules/.prisma
npm run db:generate
```

---

## Maintenance

### Update Dependencies
```bash
npm update
npm audit fix
```

### Database Cleanup
```bash
# Remove old messages (older than 90 days)
DELETE FROM messages WHERE created_at < NOW() - INTERVAL '90 days';
```

### Backup Strategy
- Daily database backups
- Weekly full backups
- Store in S3 or similar

---

## Support

For issues or questions:
- Check logs: `pm2 logs`
- Database logs: Check PostgreSQL logs
- API errors: Check error responses

---

## Scaling

### Horizontal Scaling
- Use load balancer (AWS ELB, Nginx)
- Multiple server instances
- Shared Redis cache
- Database read replicas

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Use connection pooling
- Cache frequently accessed data
