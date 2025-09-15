import { z } from 'zod';
import prisma from '../db/prisma';
import { InventoryReservation } from '@prisma/client';

// Validation schemas
export const createReservationSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().min(1),
  quantity: z.number().min(1),
  userId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  ttlMinutes: z.number().min(1).max(60).default(15),
});

export const updateReservationSchema = z.object({
  status: z.enum(['reserved', 'used', 'released', 'expired', 'cancelled']),
  orderId: z.string().uuid().optional(),
});

// Types
export interface ReservationWithDetails extends InventoryReservation {
  product?: {
    name: string;
    price: number;
  };
  store?: {
    name: string;
    address: string;
  };
}

export interface ReservationSummary {
  totalReservations: number;
  activeReservations: number;
  expiredReservations: number;
  usedReservations: number;
  totalQuantityReserved: number;
}

// Service class
export class ReservationService {
  private readonly defaultTTLMinutes: number;

  constructor() {
    this.defaultTTLMinutes = parseInt(process.env.RESERVATION_TTL_MINUTES || '15');
  }

  // Create inventory reservation
  async createReservation(
    data: z.infer<typeof createReservationSchema>
  ): Promise<InventoryReservation> {
    const { storeId, productId, quantity, userId, orderId, ttlMinutes } = data;

    // Check if product is available in store
    const inventory = await prisma.storeInventory.findFirst({
      where: {
        storeId,
        productId,
        isAvailable: true,
      },
    });

    if (!inventory) {
      throw new Error('Product not available in this store');
    }

    // Check if enough quantity is available
    const availableQuantity = inventory.quantityAvailable - inventory.reservedQuantity;
    if (availableQuantity < quantity) {
      throw new Error(`Only ${availableQuantity} items available (${quantity} requested)`);
    }

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (ttlMinutes || this.defaultTTLMinutes));

    // Create reservation
    const reservation = await prisma.inventoryReservation.create({
      data: {
        storeId,
        productId,
        quantity,
        userId,
        orderId,
        status: 'reserved',
        expiresAt,
      },
    });

    // Update store inventory reserved quantity
    await prisma.storeInventory.update({
      where: {
        storeId_productId: {
          storeId,
          productId,
        },
      },
      data: {
        reservedQuantity: {
          increment: quantity,
        },
      },
    });

    console.log(
      `[Reservation] Created reservation ${reservation.id} for ${quantity} ${productId} in store ${storeId}`
    );

    return reservation;
  }

  // Update reservation status
  async updateReservation(
    reservationId: string,
    data: z.infer<typeof updateReservationSchema>
  ): Promise<InventoryReservation> {
    const { status, orderId } = data;

    const reservation = await prisma.inventoryReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new Error('Reservation not found');
    }

    // Update reservation
    const updatedReservation = await prisma.inventoryReservation.update({
      where: { id: reservationId },
      data: {
        status,
        orderId: orderId || reservation.orderId,
        updatedAt: new Date(),
      },
    });

    // If reservation is being used or released, update store inventory
    if (status === 'used' || status === 'released' || status === 'expired') {
      await this.releaseReservedQuantity(
        reservation.storeId,
        reservation.productId,
        reservation.quantity
      );
    }

    console.log(`[Reservation] Updated reservation ${reservationId} to status ${status}`);

    return updatedReservation;
  }

  // Get reservations by user
  async getReservationsByUser(userId: string): Promise<ReservationWithDetails[]> {
    const reservations = await prisma.inventoryReservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Get additional details for each reservation
    const reservationsWithDetails = await Promise.all(
      reservations.map(async (reservation: any) => {
        // Get store details
        const store = await prisma.store.findUnique({
          where: { id: reservation.storeId },
          select: { name: true, address: true },
        });

        return {
          ...reservation,
          store,
        };
      })
    );

    return reservationsWithDetails;
  }

  // Get reservations by store
  async getReservationsByStore(storeId: string): Promise<ReservationWithDetails[]> {
    const reservations = await prisma.inventoryReservation.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });

    return reservations.map((reservation: any) => ({
      ...reservation,
    }));
  }

  // Get active reservations for a product in a store
  async getActiveReservations(storeId: string, productId: string): Promise<InventoryReservation[]> {
    return prisma.inventoryReservation.findMany({
      where: {
        storeId,
        productId,
        status: 'reserved',
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Release expired reservations
  async releaseExpiredReservations(): Promise<{
    released: number;
    reservations: InventoryReservation[];
  }> {
    const now = new Date();

    // Find expired reservations
    const expiredReservations = await prisma.inventoryReservation.findMany({
      where: {
        status: 'reserved',
        expiresAt: {
          lte: now,
        },
      },
    });

    if (expiredReservations.length === 0) {
      return { released: 0, reservations: [] };
    }

    // Update expired reservations
    await prisma.inventoryReservation.updateMany({
      where: {
        id: {
          in: expiredReservations.map((r: any) => r.id),
        },
      },
      data: {
        status: 'expired',
        updatedAt: now,
      },
    });

    // Release reserved quantities
    for (const reservation of expiredReservations) {
      await this.releaseReservedQuantity(
        reservation.storeId,
        reservation.productId,
        reservation.quantity
      );
    }

    console.log(`[Reservation] Released ${expiredReservations.length} expired reservations`);

    return {
      released: expiredReservations.length,
      reservations: expiredReservations,
    };
  }

  // Release reserved quantity in store inventory
  private async releaseReservedQuantity(
    storeId: string,
    productId: string,
    quantity: number
  ): Promise<void> {
    await prisma.storeInventory.update({
      where: {
        storeId_productId: {
          storeId,
          productId,
        },
      },
      data: {
        reservedQuantity: {
          decrement: quantity,
        },
      },
    });

    console.log(
      `[Reservation] Released ${quantity} reserved quantity for ${productId} in store ${storeId}`
    );
  }

  // Get reservation summary
  async getReservationSummary(storeId?: string): Promise<ReservationSummary> {
    const whereClause = storeId ? { storeId } : {};

    const [
      totalReservations,
      activeReservations,
      expiredReservations,
      usedReservations,
      totalQuantityReserved,
    ] = await Promise.all([
      prisma.inventoryReservation.count({ where: whereClause }),
      prisma.inventoryReservation.count({
        where: {
          ...whereClause,
          status: 'reserved',
          expiresAt: { gt: new Date() },
        },
      }),
      prisma.inventoryReservation.count({
        where: {
          ...whereClause,
          status: 'expired',
        },
      }),
      prisma.inventoryReservation.count({
        where: {
          ...whereClause,
          status: 'used',
        },
      }),
      prisma.inventoryReservation.aggregate({
        where: {
          ...whereClause,
          status: 'reserved',
          expiresAt: { gt: new Date() },
        },
        _sum: { quantity: true },
      }),
    ]);

    return {
      totalReservations,
      activeReservations,
      expiredReservations,
      usedReservations,
      totalQuantityReserved: totalQuantityReserved._sum.quantity || 0,
    };
  }

  // Cancel reservation
  async cancelReservation(reservationId: string): Promise<InventoryReservation> {
    const reservation = await prisma.inventoryReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (reservation.status !== 'reserved') {
      throw new Error('Reservation cannot be cancelled');
    }

    // Update reservation status
    const updatedReservation = await prisma.inventoryReservation.update({
      where: { id: reservationId },
      data: {
        status: 'cancelled',
        updatedAt: new Date(),
      },
    });

    // Release reserved quantity
    await this.releaseReservedQuantity(
      reservation.storeId,
      reservation.productId,
      reservation.quantity
    );

    console.log(`[Reservation] Cancelled reservation ${reservationId}`);

    return updatedReservation;
  }

  // Clean up old reservations (older than 7 days)
  async cleanupOldReservations(): Promise<number> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await prisma.inventoryReservation.deleteMany({
      where: {
        createdAt: {
          lt: sevenDaysAgo,
        },
        status: {
          in: ['expired', 'cancelled', 'used'],
        },
      },
    });

    console.log(`[Reservation] Cleaned up ${result.count} old reservations`);

    return result.count;
  }

  // Get reservation by ID
  async getReservationById(reservationId: string): Promise<ReservationWithDetails | null> {
    const reservation = await prisma.inventoryReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return null;
    }

    // Get store details
    const store = await prisma.store.findUnique({
      where: { id: reservation.storeId },
      select: { name: true, address: true },
    });

    return {
      ...reservation,
      store: store
        ? {
            name: store.name,
            address: store.address || '',
          }
        : undefined,
    };
  }
}
