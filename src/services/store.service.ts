import { z } from 'zod';
import prisma from '../db/prisma';
import { Store, StoreInventory } from '@prisma/client';

// Validation schemas
export const nearbyStoresSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius: z.number().min(0.1).max(100).default(10), // km
  limit: z.number().min(1).max(50).default(20),
});

export const storeAvailabilitySchema = z.object({
  storeId: z.string().uuid(),
});

// Types
export interface StoreWithDistance extends Store {
  distance?: number;
}

export interface StoreAvailability {
  isOpen: boolean;
  nextOpenTime?: string;
  nextCloseTime?: string;
  deliveryAvailable: boolean;
  estimatedDeliveryTime?: number; // minutes
  currentCapacity?: number;
  maxCapacity?: number;
}

export interface StoreWithInventory extends Store {
  inventory?: StoreInventory[];
}

// Service class
export class StoreService {
  // Calculate distance between two points using Haversine formula
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Get nearby stores with geospatial filtering
  async getNearbyStores(params: z.infer<typeof nearbyStoresSchema>): Promise<StoreWithDistance[]> {
    const { latitude, longitude, radius, limit } = params;

    // First, get stores within a bounding box for performance
    // This is a rough approximation - for production, consider using PostGIS
    const latDelta = radius / 111; // Rough conversion: 1 degree ≈ 111 km
    const lonDelta = radius / (111 * Math.cos(this.toRadians(latitude)));

    const stores = await prisma.store.findMany({
      where: {
        isActive: true,
        latitude: {
          gte: latitude - latDelta,
          lte: latitude + latDelta,
        },
        longitude: {
          gte: longitude - lonDelta,
          lte: longitude + lonDelta,
        },
      },
      take: limit * 2, // Get more than needed for accurate filtering
    });

    // Calculate exact distances and filter by radius
    const storesWithDistance = stores
      .map((store: any) => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          store.latitude,
          store.longitude
        );
        return {
          ...store,
          distance,
        };
      })
      .filter((store: any) => store.distance <= radius)
      .sort((a: any, b: any) => a.distance! - b.distance!)
      .slice(0, limit);

    return storesWithDistance;
  }

  // Get store by ID
  async getStoreById(storeId: string): Promise<Store | null> {
    return prisma.store.findUnique({
      where: { id: storeId },
    });
  }

  // Get store with inventory
  async getStoreWithInventory(storeId: string): Promise<StoreWithInventory | null> {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        inventories: {
          where: { isAvailable: true },
          orderBy: { productId: 'asc' },
        },
      },
    });

    return store;
  }

  // Check store availability
  async getStoreAvailability(storeId: string): Promise<StoreAvailability> {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new Error('Store not found');
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    // Parse opening hours (assuming 24-hour format)
    const openingHours = store.openingHours as any;
    const today = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase(); // 'mon', 'tue', etc.
    const todayHours = openingHours?.[today];

    let isOpen = false;
    let nextOpenTime: string | undefined;
    let nextCloseTime: string | undefined;

    if (todayHours) {
      const openTime = this.parseTime(todayHours.open);
      const closeTime = this.parseTime(todayHours.close);

      if (openTime <= closeTime) {
        // Normal hours (e.g., 8:00 - 22:00)
        isOpen = currentTime >= openTime && currentTime <= closeTime;
        nextOpenTime = todayHours.open;
        nextCloseTime = todayHours.close;
      } else {
        // Overnight hours (e.g., 22:00 - 06:00)
        isOpen = currentTime >= openTime || currentTime <= closeTime;
        nextOpenTime = todayHours.open;
        nextCloseTime = todayHours.close;
      }
    }

    // Check if delivery is available (simplified logic)
    const deliveryAvailable = isOpen && store.deliveryRadius > 0;

    // Estimate delivery time (simplified)
    const estimatedDeliveryTime = deliveryAvailable
      ? 30 + Math.floor(Math.random() * 30)
      : undefined;

    // Mock capacity data (in production, this would come from real-time data)
    const currentCapacity = Math.floor(Math.random() * 50) + 20;
    const maxCapacity = 100;

    return {
      isOpen,
      nextOpenTime,
      nextCloseTime,
      deliveryAvailable,
      estimatedDeliveryTime,
      currentCapacity,
      maxCapacity,
    };
  }

  // Parse time string (e.g., "08:00") to minutes since midnight
  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Get store statistics
  async getStoreStats(storeId: string): Promise<{
    totalProducts: number;
    availableProducts: number;
    totalInventory: number;
    reservedInventory: number;
    lowStockProducts: number;
  }> {
    const inventory = await prisma.storeInventory.findMany({
      where: { storeId },
    });

    const totalProducts = inventory.length;
    const availableProducts = inventory.filter((inv: any) => inv.isAvailable).length;
    const totalInventory = inventory.reduce((sum: any, inv: any) => sum + inv.quantityAvailable, 0);
    const reservedInventory = inventory.reduce(
      (sum: any, inv: any) => sum + inv.reservedQuantity,
      0
    );
    const lowStockProducts = inventory.filter(
      (inv: any) => inv.reorderLevel && inv.quantityAvailable <= inv.reorderLevel
    ).length;

    return {
      totalProducts,
      availableProducts,
      totalInventory,
      reservedInventory,
      lowStockProducts,
    };
  }

  // Search stores by name or description
  async searchStores(query: string, limit: number = 10): Promise<Store[]> {
    return prisma.store.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  // Get stores by city
  async getStoresByCity(city: string, state?: string): Promise<Store[]> {
    return prisma.store.findMany({
      where: {
        isActive: true,
        city: { contains: city, mode: 'insensitive' },
        ...(state && { state: { contains: state, mode: 'insensitive' } }),
      },
      orderBy: { name: 'asc' },
    });
  }

  // Update store information (admin only)
  async updateStore(
    storeId: string,
    updateData: {
      name?: string;
      description?: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      phone?: string;
      email?: string;
      openingHours?: any;
      deliveryRadius?: number;
      minOrderAmount?: number;
      isActive?: boolean;
    }
  ): Promise<Store> {
    return prisma.store.update({
      where: { id: storeId },
      data: updateData,
    });
  }

  // Create new store (admin only)
  async createStore(storeData: {
    name: string;
    description?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    latitude: number;
    longitude: number;
    phone?: string;
    email?: string;
    openingHours?: any;
    deliveryRadius?: number;
    minOrderAmount?: number;
  }): Promise<Store> {
    return prisma.store.create({
      data: {
        ...storeData,
        deliveryRadius: storeData.deliveryRadius || 10,
        minOrderAmount: storeData.minOrderAmount || 0,
      },
    });
  }
}
