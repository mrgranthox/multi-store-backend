import { z } from 'zod';
import prisma from '../db/prisma';
import { CartService } from './cart.service';
import { ReservationService } from './reservation.service';
import { PaymentService } from './payment.service';
import { OrderStatus, PaymentStatus, DeliveryType } from '@prisma/client';
import crypto from 'crypto';

// Validation schemas
export const createOrderSchema = z.object({
  storeId: z.string().uuid(),
  deliveryType: z.enum(['pickup', 'delivery']),
  deliveryAddress: z
    .object({
      title: z.string(),
      addressLine1: z.string(),
      addressLine2: z.string().optional(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      country: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
  specialInstructions: z.string().optional(),
  paymentMethod: z.string().min(1),
  idempotencyKey: z.string().uuid().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']),
  estimatedPickupTime: z.string().datetime().optional(),
  actualPickupTime: z.string().datetime().optional(),
});

// Types
export interface OrderWithItems {
  id: string;
  orderNumber: string;
  userId: string;
  storeId: string;
  status: OrderStatus;
  totalAmount: number;
  taxAmount: number;
  deliveryFee: number;
  discountAmount: number;
  paymentMethod: string | null;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType | null;
  deliveryAddress: any;
  estimatedPickupTime: Date | null;
  actualPickupTime: Date | null;
  specialInstructions: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    specialInstructions: string | null;
  }>;
  store?: {
    name: string;
    address: string;
    phone: string;
  };
}

export interface OrderSummary {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
}

// Service class
export class OrderService {
  private cartService: CartService;
  private reservationService: ReservationService;
  private paymentService: PaymentService;

  constructor() {
    this.cartService = new CartService();
    this.reservationService = new ReservationService();
    this.paymentService = new PaymentService();
  }

  // Create order with idempotency
  async createOrder(
    userId: string,
    data: z.infer<typeof createOrderSchema>
  ): Promise<OrderWithItems> {
    const {
      storeId,
      deliveryType,
      deliveryAddress,
      specialInstructions,
      paymentMethod,
      idempotencyKey,
    } = data;

    // Generate idempotency key if not provided
    const key = idempotencyKey || crypto.randomUUID();

    // Check for existing idempotency key
    const existingKey = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId: {
          key,
          userId,
        },
      },
    });

    if (existingKey) {
      if (existingKey.status === 'completed') {
        // Return existing successful response
        return existingKey.response as unknown as OrderWithItems;
      } else if (existingKey.status === 'in_progress') {
        throw new Error('Order is already being processed');
      } else if (existingKey.status === 'failed') {
        // Allow retry for failed orders
        await prisma.idempotencyKey.delete({
          where: { id: existingKey.id },
        });
      }
    }

    // Create idempotency key
    const idempotencyRecord = await prisma.idempotencyKey.create({
      data: {
        key,
        userId,
        status: 'in_progress',
        requestHash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),
      },
    });

    try {
      // Validate cart
      const cartValidation = await this.cartService.validateCartForCheckout(userId, storeId);
      if (!cartValidation.valid) {
        throw new Error(`Cart validation failed: ${cartValidation.errors.join(', ')}`);
      }

      // Get cart with items
      const cart = await this.cartService.getCartWithItems(userId, storeId);
      if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // Start transaction
      const result = await prisma.$transaction(async (tx: any) => {
        // Create inventory reservations
        const reservations = [];
        for (const item of cart.items) {
          const reservation = await tx.inventoryReservation.create({
            data: {
              storeId,
              productId: item.productId,
              quantity: item.quantity,
              userId,
              status: 'reserved',
              expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
            },
          });
          reservations.push(reservation);

          // Update store inventory
          await tx.storeInventory.update({
            where: {
              storeId_productId: {
                storeId,
                productId: item.productId,
              },
            },
            data: {
              reservedQuantity: {
                increment: item.quantity,
              },
            },
          });
        }

        // Generate order number
        const orderNumber = await this.generateOrderNumber();

        // Create order
        const order = await tx.order.create({
          data: {
            orderNumber,
            userId,
            storeId,
            status: 'pending',
            totalAmount: cart.totals.total,
            taxAmount: cart.totals.tax,
            deliveryFee: cart.totals.deliveryFee,
            discountAmount: cart.totals.discount,
            paymentMethod,
            paymentStatus: 'pending',
            deliveryType,
            deliveryAddress,
            specialInstructions,
          },
        });

        // Create order items
        const orderItems = await Promise.all(
          cart.items.map(item =>
            tx.orderItem.create({
              data: {
                orderId: order.id,
                productId: item.productId,
                productName: item.product?.attributes?.name || `Product ${item.productId}`,
                quantity: item.quantity,
                unitPrice: item.priceAtTime,
                totalPrice: Number(item.priceAtTime) * item.quantity,
                specialInstructions: null,
              },
            })
          )
        );

        // Process payment
        const paymentResult = await this.paymentService.processPayment({
          amount: cart.totals.total,
          paymentMethod,
          orderId: order.id,
          userId,
        });

        if (!paymentResult.success) {
          throw new Error(`Payment failed: ${paymentResult.error}`);
        }

    // Update order with payment result
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: paymentResult.success ? 'paid' : 'failed',
        status: paymentResult.success ? 'confirmed' : 'pending',
      },
    });

        // Update reservations to used
        if (paymentResult.success) {
          await tx.inventoryReservation.updateMany({
            where: {
              id: { in: reservations.map(r => r.id) },
            },
            data: {
              status: 'used',
              orderId: order.id,
            },
          });
        }

        // Clear cart
        await tx.cartItem.deleteMany({
          where: { cartId: (cart as any).id },
        });

        return {
          order: order,
          items: orderItems,
        };
      });

      // Update idempotency key with success
      await prisma.idempotencyKey.update({
        where: { id: idempotencyRecord.id },
        data: {
          status: 'completed',
          response: result,
        },
      });

      // Get order with store details
      const orderWithDetails = await this.getOrderById(result.order.id);

      console.log(`[Order] Created order ${result.order.orderNumber} for user ${userId}`);

      return orderWithDetails!;
    } catch (error) {
      // Update idempotency key with failure
      await prisma.idempotencyKey.update({
        where: { id: idempotencyRecord.id },
        data: {
          status: 'failed',
          response: { error: error instanceof Error ? error.message : 'Unknown error' },
        },
      });

      // Release any reservations that were created
      await this.releaseReservationsForFailedOrder(userId, storeId);

      throw error;
    }
  }

  // Get order by ID
  async getOrderById(orderId: string): Promise<OrderWithItems | null> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
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
      return null;
    }

    return {
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
      store: order.store
        ? {
            name: order.store.name,
            address: order.store.address || '',
            phone: order.store.phone || '',
          }
        : undefined,
    };
  }

  // Get orders by user
  async getOrdersByUser(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<OrderWithItems[]> {
    const orders = await prisma.order.findMany({
      where: { userId },
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
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return orders.map((order: any) => ({
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
    }));
  }

  // Update order status
  async updateOrderStatus(
    orderId: string,
    data: z.infer<typeof updateOrderStatusSchema>
  ): Promise<OrderWithItems> {
    const { status, estimatedPickupTime, actualPickupTime } = data;

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (estimatedPickupTime) {
      updateData.estimatedPickupTime = new Date(estimatedPickupTime);
    }

    if (actualPickupTime) {
      updateData.actualPickupTime = new Date(actualPickupTime);
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    console.log(`[Order] Updated order ${order.orderNumber} status to ${status}`);

    return this.getOrderById(orderId) as Promise<OrderWithItems>;
  }

  // Cancel order
  async cancelOrder(orderId: string, userId: string): Promise<OrderWithItems> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (order.status === 'completed') {
      throw new Error('Cannot cancel completed order');
    }

    if (order.status === 'cancelled') {
      throw new Error('Order is already cancelled');
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'cancelled',
        updatedAt: new Date(),
      },
    });

    // Release inventory reservations
    await this.releaseReservationsForOrder(orderId);

    // Process refund if payment was successful
    if (order.paymentStatus === 'paid') {
      await this.paymentService.processRefund({
        orderId,
        amount: Number(order.totalAmount),
        reason: 'Order cancelled by customer',
      });
    }

    console.log(`[Order] Cancelled order ${order.orderNumber}`);

    return this.getOrderById(orderId) as Promise<OrderWithItems>;
  }

  // Get order summary
  async getOrderSummary(storeId?: string): Promise<OrderSummary> {
    const whereClause = storeId ? { storeId } : {};

    const [totalOrders, pendingOrders, completedOrders, cancelledOrders, revenueData] =
      await Promise.all([
        prisma.order.count({ where: whereClause }),
        prisma.order.count({
          where: {
            ...whereClause,
            status: 'pending',
          },
        }),
        prisma.order.count({
          where: {
            ...whereClause,
            status: 'completed',
          },
        }),
        prisma.order.count({
          where: {
            ...whereClause,
            status: 'cancelled',
          },
        }),
        prisma.order.aggregate({
          where: {
            ...whereClause,
            paymentStatus: 'paid',
          },
          _sum: { totalAmount: true },
        }),
      ]);

    const totalRevenue = Number(revenueData._sum.totalAmount || 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue,
      averageOrderValue,
    };
  }

  // Generate unique order number
  private async generateOrderNumber(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const orderNumber = `ORD-${timestamp}-${random}`.toUpperCase();

    // Check if order number already exists
    const existing = await prisma.order.findUnique({
      where: { orderNumber },
    });

    if (existing) {
      return this.generateOrderNumber(); // Recursive call to generate new number
    }

    return orderNumber;
  }

  // Release reservations for failed order
  private async releaseReservationsForFailedOrder(userId: string, storeId: string): Promise<void> {
    const reservations = await prisma.inventoryReservation.findMany({
      where: {
        userId,
        storeId,
        status: 'reserved',
        orderId: null,
      },
    });

    for (const reservation of reservations) {
      await this.reservationService.updateReservation(reservation.id, {
        status: 'released',
      });
    }
  }

  // Release reservations for order
  private async releaseReservationsForOrder(orderId: string): Promise<void> {
    const reservations = await prisma.inventoryReservation.findMany({
      where: {
        orderId,
        status: 'used',
      },
    });

    for (const reservation of reservations) {
      await this.reservationService.updateReservation(reservation.id, {
        status: 'released',
      });
    }
  }
}
