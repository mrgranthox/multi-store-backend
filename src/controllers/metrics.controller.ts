import { Request, Response } from 'express';
import { MonitoringService } from '../services/monitoring.service';

export class MetricsController {
  private monitoringService: MonitoringService;

  constructor() {
    this.monitoringService = new MonitoringService();
  }

  // Basic health check
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const healthStatus = await this.monitoringService.getHealthStatus();
      
      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: healthStatus.status === 'healthy',
        data: healthStatus,
        message: healthStatus.status === 'healthy' 
          ? 'All services are healthy' 
          : 'One or more services are unhealthy',
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        success: false,
        message: 'Health check failed',
        error: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  };

  // Detailed health check
  detailedHealthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const detailedHealth = await this.monitoringService.getDetailedHealthCheck();
      
      const statusCode = detailedHealth.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: detailedHealth.status === 'healthy',
        data: detailedHealth,
        message: detailedHealth.status === 'healthy' 
          ? 'System is fully operational' 
          : 'System has issues that need attention',
      });
    } catch (error) {
      console.error('Detailed health check error:', error);
      res.status(500).json({
        success: false,
        message: 'Detailed health check failed',
        error: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  };

  // System metrics
  systemMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await this.monitoringService.getSystemMetrics();
      
      res.json({
        success: true,
        data: metrics,
        message: 'System metrics retrieved successfully',
      });
    } catch (error) {
      console.error('System metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve system metrics',
        error: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  };

  // Application metrics
  applicationMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await this.monitoringService.getApplicationMetrics();
      
      res.json({
        success: true,
        data: metrics,
        message: 'Application metrics retrieved successfully',
      });
    } catch (error) {
      console.error('Application metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve application metrics',
        error: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  };

  // Service-specific health checks
  databaseHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      const dbHealth = await this.monitoringService.checkDatabase();
      
      const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: dbHealth.status === 'healthy',
        data: dbHealth,
        message: dbHealth.status === 'healthy' 
          ? 'Database is healthy' 
          : 'Database is unhealthy',
      });
    } catch (error) {
      console.error('Database health check error:', error);
      res.status(500).json({
        success: false,
        message: 'Database health check failed',
        error: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  };

  redisHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      const redisHealth = await this.monitoringService.checkRedis();
      
      const statusCode = redisHealth.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: redisHealth.status === 'healthy',
        data: redisHealth,
        message: redisHealth.status === 'healthy' 
          ? 'Redis is healthy' 
          : 'Redis is unhealthy',
      });
    } catch (error) {
      console.error('Redis health check error:', error);
      res.status(500).json({
        success: false,
        message: 'Redis health check failed',
        error: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  };

  strapiHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      const strapiHealth = await this.monitoringService.checkStrapi();
      
      const statusCode = strapiHealth.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: strapiHealth.status === 'healthy',
        data: strapiHealth,
        message: strapiHealth.status === 'healthy' 
          ? 'Strapi CMS is healthy' 
          : 'Strapi CMS is unhealthy',
      });
    } catch (error) {
      console.error('Strapi health check error:', error);
      res.status(500).json({
        success: false,
        message: 'Strapi health check failed',
        error: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  };

  // Readiness probe for Kubernetes
  readiness = async (req: Request, res: Response): Promise<void> => {
    try {
      const healthStatus = await this.monitoringService.getHealthStatus();
      
      if (healthStatus.status === 'healthy') {
        res.status(200).json({
          success: true,
          message: 'Application is ready to serve traffic',
        });
      } else {
        res.status(503).json({
          success: false,
          message: 'Application is not ready to serve traffic',
          services: healthStatus.services,
        });
      }
    } catch (error) {
      console.error('Readiness check error:', error);
      res.status(503).json({
        success: false,
        message: 'Readiness check failed',
      });
    }
  };

  // Liveness probe for Kubernetes
  liveness = async (req: Request, res: Response): Promise<void> => {
    try {
      // Simple liveness check - if the process is running, it's alive
      res.status(200).json({
        success: true,
        message: 'Application is alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    } catch (error) {
      console.error('Liveness check error:', error);
      res.status(500).json({
        success: false,
        message: 'Liveness check failed',
      });
    }
  };
}

export const getMetrics = async (req: Request, res: Response) => {
  try {
    const metrics = await MonitoringService.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get metrics', error });
  }
};
