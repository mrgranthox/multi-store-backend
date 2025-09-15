// src/controllers/analytics.controller.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponseUtil } from '../utils/api-response';

const prisma = new PrismaClient();

export class AnalyticsController {

  // Filter orders based on user role
  private async getStoreFilter(role: string, userId: string) {
    if (role === 'admin') return {};
    
    const managedStores = await prisma.storeManager.findMany({
      where: { userId, isActive: true },
      select: { storeId: true }
    });
    const storeIds = managedStores.map(s => s.storeId);
    return { storeId: { in: storeIds } };
  }

  async getDashboardStats(req: Request, res: Response) {
    try {
      const { userId, role } = req.user as any;
      const storeFilter = await this.getStoreFilter(role, userId);

      const [totalOrders, totalRevenue, activeStores, recentOrders, totalProducts] = await Promise.all([
        prisma.order.count({ where: storeFilter }),
        prisma.order.aggregate({ where: storeFilter, _sum: { totalAmount: true } }),
        prisma.store.count({ where: { isActive: true } }),
        prisma.order.findMany({
          where: storeFilter,
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            user: true,
            store: true,
            items: true
          }
        }),
        prisma.product.count()
      ]);

      const totalRevenueAmount = Number(totalRevenue?._sum?.totalAmount || 0);

      const stats = {
        totalOrders,
        totalRevenue: totalRevenueAmount,
        totalProducts,
        activeStores,
        averageOrderValue: totalOrders > 0 ? totalRevenueAmount / totalOrders : 0,
        recentOrders,
        topProducts: [] // Can fill later from OrderItems
      };

      return ApiResponseUtil.success(res, stats, 'Dashboard stats retrieved successfully');
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve dashboard stats');
    }
  }

  async getSalesAnalytics(req: Request, res: Response) {
    try {
      const { period = '30d' } = req.query;
      const { userId, role } = req.user as any;
      const storeFilter = await this.getStoreFilter(role, userId);

      const now = new Date();
      const startDate = new Date();
      const periods: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      startDate.setDate(now.getDate() - (periods[period as string] || 30));

      const salesData = await prisma.order.groupBy({
        by: ['createdAt'],
        where: { createdAt: { gte: startDate, lte: now }, ...storeFilter },
        _sum: { totalAmount: true },
        _count: { id: true },
        orderBy: { createdAt: 'asc' }
      });

      const ordersByStatus = await prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate, lte: now }, ...storeFilter },
        _count: { id: true }
      });

      const topProducts = await prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { createdAt: { gte: startDate, lte: now }, ...storeFilter } },
        _sum: { quantity: true, totalPrice: true },
        _count: { productId: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10
      });

      const storePerformance = await prisma.order.groupBy({
        by: ['storeId'],
        where: { createdAt: { gte: startDate, lte: now }, ...storeFilter },
        _sum: { totalAmount: true },
        _count: { id: true },
        orderBy: { _sum: { totalAmount: 'desc' } }
      });

      const analytics = {
        salesTrend: salesData.map(item => ({
          date: item.createdAt.toISOString().split('T')[0],
          revenue: Number(item?._sum?.totalAmount || 0),
          orders: item?._count?.id || 0
        })),
        ordersByStatus: ordersByStatus.map(item => ({
          status: item.status,
          count: item?._count?.id || 0
        })),
        topProducts: topProducts.map(p => ({
          productId: p.productId,
          quantitySold: Number(p._sum.quantity || 0),
          revenue: Number(p._sum.totalPrice || 0)
        })),
        storePerformance: storePerformance.map(item => ({
          storeId: item.storeId,
          revenue: Number(item?._sum?.totalAmount || 0),
          orders: item?._count?.id || 0
        }))
      };

      return ApiResponseUtil.success(res, analytics, 'Sales analytics retrieved successfully');
    } catch (error) {
      console.error('Error getting sales analytics:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve sales analytics');
    }
  }

  async getOrderAnalytics(req: Request, res: Response) {
    try {
      const { userId, role } = req.user as any;
      const storeFilter = await this.getStoreFilter(role, userId);

      const orderStats = await prisma.order.groupBy({
        by: ['status'],
        where: storeFilter,
        _count: { id: true }
      });

      return ApiResponseUtil.success(res, orderStats, 'Order analytics retrieved successfully');
    } catch (error) {
      console.error('Error getting order analytics:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve order analytics');
    }
  }

  async getProductAnalytics(req: Request, res: Response) {
    try {
      const { userId, role } = req.user as any;
      const storeFilter = await this.getStoreFilter(role, userId);

      const productStats = await prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: storeFilter },
        _sum: { quantity: true, totalPrice: true },
        _count: { productId: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 20
      });

      return ApiResponseUtil.success(res, productStats, 'Product analytics retrieved successfully');
    } catch (error) {
      console.error('Error getting product analytics:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve product analytics');
    }
  }

  async getStoreAnalytics(req: Request, res: Response) {
    try {
      const { userId, role } = req.user as any;
      const storeFilter = await this.getStoreFilter(role, userId);

      const storeStats = await prisma.order.groupBy({
        by: ['storeId'],
        where: storeFilter,
        _sum: { totalAmount: true },
        _count: { id: true },
        orderBy: { _sum: { totalAmount: 'desc' } }
      });

      return ApiResponseUtil.success(res, storeStats, 'Store analytics retrieved successfully');
    } catch (error) {
      console.error('Error getting store analytics:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve store analytics');
    }
  }
}
