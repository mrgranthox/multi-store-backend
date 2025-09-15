import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Import routes
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import storeRoutes from './routes/store.routes';
import productRoutes from './routes/product.routes';
import cartRoutes from './routes/cart.routes';
import orderRoutes from './routes/order.routes';
import webhookRoutes from './routes/webhook.routes';
import metricsRoutes from './routes/metrics.routes';
import analyticsRoutes from './routes/analytics.routes';
import settingsRoutes from './routes/settings.routes';
import categoryRoutes from './routes/category.routes';
import inventoryRoutes from './routes/inventory.routes';

// Import middleware
import { AuthMiddleware } from './middlewares/auth.middleware';
import {
  helmetConfig,
  corsOptions,
  apiRateLimit,
  authRateLimit,
  webhookRateLimit,
  sanitizeInput,
  requestSizeLimit,
  securityHeaders,
  auditLog,
} from './middlewares/security.middleware';

const app = express();
const authMiddleware = new AuthMiddleware();

// Security middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  credentials: true,
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP
}));

// Enforce HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect('https://' + req.headers.host + req.url);
    }
    next();
  });
}

// NOTE: Ensure DB pooler (e.g., pgbouncer) is used in production for Postgres
// NOTE: Ensure Redis AUTH is set in production and REDIS_URL includes password
// NOTE: All secrets (DB, JWT, Sentry, etc.) must be loaded from environment variables

// Security headers and request tracking
app.use(securityHeaders);

// Input sanitization
app.use(sanitizeInput);

// Request size limiting
app.use(requestSizeLimit('10mb'));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Audit logging
app.use(auditLog);

// Apply rate limiting
app.use(apiRateLimit);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Metrics and health check routes
app.use('/api/metrics', metricsRoutes);

// API routes
app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/webhooks', webhookRateLimit, webhookRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);

  // Handle specific error types
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
    });
    return;
  }

  if (err.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      message: 'Request entity too large',
    });
    return;
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

export default app;
