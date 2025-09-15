import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponseUtil } from '../utils/api-response';

const prisma = new PrismaClient();

export class InventoryController {
  async getInventory(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, storeId, productId } = req.query;
      const { userId, role } = req.user as any;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      
      // Filter by store if user is manager
      if (role === 'manager') {
        where.store = { managerId: userId };
      } else if (storeId) {
        where.storeId = storeId as string;
      }

      if (productId) {
        where.productId = productId as string;
      }

      const [inventory, total] = await Promise.all([
        prisma.storeInventory.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            product: true,
            store: true
          },
          orderBy: { updatedAt: 'desc' }
        }),
        prisma.storeInventory.count({ where })
      ]);

      return ApiResponseUtil.success(res, {
        data: inventory,
        meta: {
          pagination: {
            page: Number(page),
            pageSize: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit))
          }
        }
      }, 'Inventory retrieved successfully');
    } catch (error) {
      console.error('Error getting inventory:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve inventory');
    }
  }

  async getLowStockItems(req: Request, res: Response) {
    try {
      const { userId, role } = req.user as any;
      
      const where: any = {
        quantityAvailable: {
          lte: prisma.storeInventory.fields.reorderLevel
        }
      };

      // Filter by store if user is manager
      if (role === 'manager') {
        where.store = { managerId: userId };
      }

      const lowStockItems = await prisma.storeInventory.findMany({
        where,
        include: {
          product: true,
          store: true
        },
        orderBy: { quantityAvailable: 'asc' }
      });

      return ApiResponseUtil.success(res, lowStockItems, 'Low stock items retrieved successfully');
    } catch (error) {
      console.error('Error getting low stock items:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve low stock items');
    }
  }

  async getInventoryById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { userId, role } = req.user as any;

      const where: any = { id };
      
      // Filter by store if user is manager
      if (role === 'manager') {
        where.store = { managerId: userId };
      }

      const inventory = await prisma.storeInventory.findFirst({
        where,
        include: {
          product: true,
          store: true
        }
      });

      if (!inventory) {
        return ApiResponseUtil.notFound(res, 'Inventory item not found');
      }

      return ApiResponseUtil.success(res, inventory, 'Inventory item retrieved successfully');
    } catch (error) {
      console.error('Error getting inventory item:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve inventory item');
    }
  }

  async updateInventory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { quantityAvailable, reorderLevel, isActive } = req.body;
      const { userId, role } = req.user as any;

      const where: any = { id };
      
      // Filter by store if user is manager
      if (role === 'manager') {
        where.store = { managerId: userId };
      }

      const existingInventory = await prisma.storeInventory.findFirst({
        where
      });

      if (!existingInventory) {
        return ApiResponseUtil.notFound(res, 'Inventory item not found');
      }

      const inventory = await prisma.storeInventory.update({
        where: { id },
        data: {
          ...(quantityAvailable !== undefined && { quantityAvailable }),
          ...(reorderLevel !== undefined && { reorderLevel }),
          ...(isActive !== undefined && { isActive })
        },
        include: {
          product: true,
          store: true
        }
      });

      return ApiResponseUtil.success(res, inventory, 'Inventory updated successfully');
    } catch (error) {
      console.error('Error updating inventory:', error);
      return ApiResponseUtil.internalError(res, 'Failed to update inventory');
    }
  }
}
