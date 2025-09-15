import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import axios from 'axios';
import * as Sentry from '@sentry/node';
import { collectDefaultMetrics, Registry } from 'prom-client';

const prisma = new PrismaClient();

class MonitoringService {
  private redis: Redis;
  private strapiUrl: string;
  private registry: Registry;

  constructor() {
    if (process.env.SENTRY_DSN) {
      Sentry.init({ dsn: process.env.SENTRY_DSN });
      console.log('[Monitoring] Sentry initialized');
    }
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.strapiUrl = process.env.STRAPI_BASE_URL || 'http://localhost:1337';
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });
    console.log('[Monitoring] Prometheus metrics collection started');
  }

  captureException(error: any) {
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }

  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  // Health check for database
  async checkDatabase(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  // Health check for Redis
  async checkRedis(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      await this.redis.ping();
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      };
    }
  }

  // Health check for Strapi CMS
  async checkStrapi(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${this.strapiUrl}/api/health`, { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        return {
          status: 'healthy',
          responseTime,
        };
      } else {
        return {
          status: 'unhealthy',
          responseTime,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Strapi error',
      };
    }
  }

  // Get system metrics
  async getSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }

  // Get application metrics
  async getApplicationMetrics() {
    try {
      const [
        userCount,
        storeCount,
        orderCount,
        activeOrders,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.store.count(),
        prisma.order.count(),
        prisma.order.count({ where: { status: { in: ['pending', 'confirmed', 'preparing'] } } }),
      ]);

      return {
        users: {
          total: userCount,
        },
        stores: {
          total: storeCount,
        },
        orders: {
          total: orderCount,
          active: activeOrders,
        },
      };
    } catch (error) {
      console.error('Error getting application metrics:', error);
      return {
        users: { total: 0 },
        stores: { total: 0 },
        orders: { total: 0, active: 0 },
      };
    }
  }

  // Comprehensive health check
  async getHealthStatus() {
    const [database, redis, strapi, systemMetrics, appMetrics] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStrapi(),
      this.getSystemMetrics(),
      this.getApplicationMetrics(),
    ]);

    const overallStatus = [database, redis, strapi].every(service => service.status === 'healthy')
      ? 'healthy'
      : 'unhealthy';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        database,
        redis,
        strapi,
      },
      system: systemMetrics,
      application: appMetrics,
    };
  }

  // Get detailed health check for monitoring
  async getDetailedHealthCheck() {
    const healthStatus = await this.getHealthStatus();
    
    // Add additional checks
    const additionalChecks = {
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 4000,
      version: process.env.npm_package_version || '1.0.0',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    return {
      ...healthStatus,
      ...additionalChecks,
    };
  }

  // Cleanup method
  async cleanup() {
    await this.redis.disconnect();
    await prisma.$disconnect();
  }
}

export const monitoringService = new MonitoringService();
