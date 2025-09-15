# Multi-Store E-commerce Backend

A production-ready Node.js + TypeScript backend for multi-store e-commerce applications, designed for Back4App integration with Strapi CMS.

## 📁 Project Location
This project is located in: `/home/edward-nyame/Desktop/multi-store-backend/`

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with refresh token rotation
- **Multi-Store Support**: Geospatial store discovery and management
- **Inventory Management**: Real-time inventory tracking with reservations
- **Order Processing**: Idempotent order creation with payment integration
- **Strapi Integration**: Seamless CMS integration with webhook support
- **Real-time Updates**: WebSocket support for live notifications
- **Background Jobs**: BullMQ-powered job processing
- **Comprehensive Testing**: Unit, integration, and Postman tests
- **Production Ready**: Docker, CI/CD, monitoring, and security features

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (optional)

## 🛠️ Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd multi-store-ecommerce-back4app
npm install
```

### 2. Environment Setup

```bash
cp env.example .env
# Edit .env with your configuration
```

### 3. Database Setup

```bash
# Using Docker Compose (recommended)
docker-compose up -d postgres redis

# Wait for services to be ready (about 10-15 seconds)
sleep 15

# Run database migrations
npm run migrate

# Seed the database with sample data
npm run seed
```

**Note:** If you don't have Docker, you can install PostgreSQL and Redis manually:
- PostgreSQL 15+ with a database named `ecom`
- Redis 7+ running on port 6379

### 5. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:4000`

## 📁 Project Structure

```
src/
├── controllers/          # Request handlers
├── services/            # Business logic
├── routes/              # API routes
├── middlewares/         # Custom middleware
├── db/                  # Database connection
├── prisma/              # Prisma schema and migrations
├── tests/               # Test files
├── utils/               # Utility functions
└── jobs/                # Background job processors

migrations_sql/          # SQL migration files
scripts/                 # Utility scripts
postman/                 # API testing collection
```

## 🔧 Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm start                # Start production server

# Database
npm run migrate          # Run database migrations
npm run migrate:reset    # Reset database (dev only)
npm run seed             # Seed database with sample data

# Testing
npm test                 # Run unit tests
npm run test:integration # Run integration tests
npm run test:watch       # Run tests in watch mode
npm run postman          # Run Postman collection tests

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint errors
npm run format           # Format code with Prettier
```

## 🗄️ Database Schema

The application uses PostgreSQL with Prisma ORM. Key models include:

- **Users**: Customer and admin accounts
- **Stores**: Multi-location store management
- **StoreInventory**: Product availability per store
- **InventoryReservation**: Temporary inventory holds
- **Orders**: Order processing with idempotency
- **ShoppingCart**: User cart management
- **UserSessions**: JWT session management

## 🔐 Authentication

The API uses JWT tokens with refresh token rotation:

```bash
# Register
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}

# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

# Refresh Token
POST /api/auth/refresh-token
{
  "refreshToken": "your-refresh-token"
}
```

## 🏪 Store Management

```bash
# Get nearby stores
GET /api/stores/nearby?latitude=40.7589&longitude=-73.9851&radius=10

# Get store details
GET /api/stores/:storeId

# Check store availability
GET /api/stores/:storeId/availability
```

## 🛒 Shopping Cart

```bash
# Get cart
GET /api/cart

# Add item to cart
POST /api/cart/items
{
  "productId": "prod_1",
  "quantity": 2
}

# Update cart item
PUT /api/cart/items/:itemId
{
  "quantity": 3
}

# Clear cart
DELETE /api/cart/clear
```

## 📦 Order Processing

```bash
# Create order (idempotent)
POST /api/orders
Headers: { "Idempotency-Key": "unique-key" }
{
  "storeId": "store_1",
  "deliveryType": "delivery",
  "deliveryAddress": { ... }
}

# Get order
GET /api/orders/:orderId

# Update order status (store manager)
PUT /api/orders/:orderId/status
{
  "status": "preparing"
}
```

## 🔗 Strapi Integration

The backend integrates with Strapi CMS for product management:

### Webhook Endpoints

- `POST /webhooks/product-updated` - Product changes
- `POST /webhooks/inventory-updated` - Inventory updates
- `POST /webhooks/promotion-updated` - Promotion changes

### Strapi Configuration

Configure these webhooks in your Strapi admin:

```javascript
// webhooks/product.updated
{
  "name": "product.updated",
  "url": "https://your-backend.com/webhooks/product-updated",
  "events": ["entry.update", "entry.create", "entry.publish"],
  "contentTypes": ["api::product.product"]
}
```

## 🐳 Docker Deployment

### Development

```bash
docker-compose up -d
```

### Production

```bash
# Build image
docker build -t multi-store-ecommerce .

# Run with environment variables
docker run -d \
  -p 4000:4000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e REDIS_URL=redis://host:6379 \
  multi-store-ecommerce
```

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Postman Collection

```bash
# Start the server first
npm run dev

# Run Postman tests
npm run postman
```

## 📊 Monitoring & Observability

- **Health Check**: `GET /health`
- **Sentry Integration**: Error tracking and performance monitoring
- **Prometheus Metrics**: Application metrics collection
- **Structured Logging**: JSON-formatted logs with correlation IDs

## 🔒 Security Features

- **Rate Limiting**: Per-endpoint and per-IP rate limiting
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet.js**: Security headers and XSS protection
- **Input Validation**: Zod schema validation
- **SQL Injection Protection**: Prisma ORM with parameterized queries
- **JWT Security**: Secure token generation and validation

## 🚀 Deployment

### Back4App

1. Connect your GitHub repository
2. Configure environment variables
3. Deploy using Back4App's build system

### Manual Deployment

1. Build the application: `npm run build`
2. Run migrations: `npm run migrate:deploy`
3. Start the server: `npm start`

## 📈 Performance

- **Database Indexing**: Optimized queries with proper indexes
- **Redis Caching**: Stale-while-revalidate caching strategy
- **Connection Pooling**: Prisma connection pool optimization
- **Compression**: Gzip compression for API responses
- **Rate Limiting**: Prevents abuse and ensures fair usage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the documentation
- Review the Postman collection for API examples

## 🔄 Roadmap

- [ ] M2: Store endpoints and Strapi sync
- [ ] M3: Cart, reservations, and order processing
- [ ] M4: Webhooks, real-time, and CI/CD
- [ ] Advanced analytics and reporting
- [ ] Multi-currency support
- [ ] Advanced inventory management
- [ ] Mobile app integration

## Backups & Disaster Recovery

- **Daily logical backups**: Use `pg_dump` to create daily logical backups of the production database.
- **S3 upload**: Upload backup files to S3 (or other cloud storage) for retention and offsite safety.
- **PITR/WAL**: Enable Point-In-Time Recovery (PITR) or WAL archiving as supported by your Postgres provider for advanced recovery.
- **Restore tests**: Test restores quarterly to ensure backup integrity and DR readiness.

### Example cron job for daily backup

```
0 2 * * * pg_dump "$DATABASE_URL" > /backups/db-$(date +\%F).sql && aws s3 cp /backups/db-$(date +\%F).sql s3://your-bucket/db-backups/
```

- Replace `/backups/` and `s3://your-bucket/db-backups/` with your actual backup and S3 paths.
- Automate cleanup of old backups as needed.

### Restore

- To restore, download the backup from S3 and run:
  `psql "$DATABASE_URL" < db-YYYY-MM-DD.sql`
- Test restores quarterly and document the process.
