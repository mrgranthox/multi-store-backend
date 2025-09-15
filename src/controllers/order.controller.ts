import { Request, Response } from 'express';
import { z } from 'zod';
import {
  OrderService,
  createOrderSchema,
  updateOrderStatusSchema,
} from '../services/order.service';

export class OrderController {
  private orderService: OrderService;

  constructor() {
    this.orderService = new OrderService();
  }

  // Create order
  createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Get idempotency key from headers
      const idempotencyKey = req.headers['idempotency-key'] as string;

      // Validate request body
      const validatedData = createOrderSchema.parse({
        ...req.body,
        idempotencyKey,
      });

      const order = await this.orderService.createOrder(userId, validatedData);

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: { order },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      console.error('[Order] Error creating order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get order by ID
  getOrderById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { orderId } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!orderId) {
        res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
        return;
      }

      const order = await this.orderService.getOrderById(orderId);

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found',
        });
        return;
      }

      // Check if user owns this order
      if (order.userId !== userId) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      res.json({
        success: true,
        data: { order },
      });
    } catch (error) {
      console.error('[Order] Error getting order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get orders by user
  getOrdersByUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { limit = 20, offset = 0 } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const orders = await this.orderService.getOrdersByUser(
        userId,
        parseInt(limit as string) || 20,
        parseInt(offset as string) || 0
      );

      res.json({
        success: true,
        data: {
          orders,
          count: orders.length,
          pagination: {
            limit: parseInt(limit as string) || 20,
            offset: parseInt(offset as string) || 0,
          },
        },
      });
    } catch (error) {
      console.error('[Order] Error getting user orders:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Update order status (store manager only)
  updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
        return;
      }

      // Validate request body
      const validatedData = updateOrderStatusSchema.parse(req.body);

      const order = await this.orderService.updateOrderStatus(orderId, validatedData);

      res.json({
        success: true,
        message: 'Order status updated successfully',
        data: { order },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      console.error('[Order] Error updating order status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Cancel order
  cancelOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { orderId } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!orderId) {
        res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
        return;
      }

      const order = await this.orderService.cancelOrder(orderId, userId);

      res.json({
        success: true,
        message: 'Order cancelled successfully',
        data: { order },
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      console.error('[Order] Error cancelling order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get order summary (admin/store manager)
  getOrderSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const { storeId } = req.query;

      const summary = await this.orderService.getOrderSummary(storeId as string | undefined);

      res.json({
        success: true,
        data: { summary },
      });
    } catch (error) {
      console.error('[Order] Error getting order summary:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get order by order number
  getOrderByNumber = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { orderNumber } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!orderNumber) {
        res.status(400).json({
          success: false,
          message: 'Order number is required',
        });
        return;
      }

      // Find order by order number
      const order = await prisma.order.findUnique({
        where: { orderNumber },
        include: {
          items: true,
          store: {
            select: {
              name: true,
              address: true,
              phone: true,
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found',
        });
        return;
      }

      // Check if user owns this order
      if (order.userId !== userId) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const orderWithItems = {
        id: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        storeId: order.storeId,
        status: order.status,
        totalAmount: Number(order.totalAmount),
        taxAmount: Number(order.taxAmount),
        deliveryFee: Number(order.deliveryFee),
        discountAmount: Number(order.discountAmount),
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        deliveryType: order.deliveryType,
        deliveryAddress: order.deliveryAddress,
        estimatedPickupTime: order.estimatedPickupTime,
        actualPickupTime: order.actualPickupTime,
        specialInstructions: order.specialInstructions,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: order.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          specialInstructions: item.specialInstructions,
        })),
        store: order.store,
      };

      res.json({
        success: true,
        data: { order: orderWithItems },
      });
    } catch (error) {
      console.error('[Order] Error getting order by number:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}

// Import prisma for order lookup
import prisma from '../db/prisma';
