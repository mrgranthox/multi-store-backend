import { Request, Response } from 'express';
import {
  StoreService,
  nearbyStoresSchema,
  storeAvailabilitySchema,
} from '../services/store.service';
import { z } from 'zod';

export class StoreController {
  private storeService: StoreService;

  constructor() {
    this.storeService = new StoreService();
  }

  // Get nearby stores
  getNearbyStores = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate query parameters
      const validatedParams = nearbyStoresSchema.parse({
        latitude: parseFloat(req.query.latitude as string),
        longitude: parseFloat(req.query.longitude as string),
        radius: req.query.radius ? parseFloat(req.query.radius as string) : 10,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      });

      const stores = await this.storeService.getNearbyStores(validatedParams);

      res.json({
        success: true,
        data: {
          stores,
          count: stores.length,
          searchParams: validatedParams,
        },
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

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get store by ID
  getStoreById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { storeId } = req.params;

      if (!storeId) {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      const store = await this.storeService.getStoreById(storeId);

      if (!store) {
        res.status(404).json({
          success: false,
          message: 'Store not found',
        });
        return;
      }

      res.json({
        success: true,
        data: { store },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get store with inventory
  getStoreWithInventory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { storeId } = req.params;

      if (!storeId) {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      const store = await this.storeService.getStoreWithInventory(storeId);

      if (!store) {
        res.status(404).json({
          success: false,
          message: 'Store not found',
        });
        return;
      }

      res.json({
        success: true,
        data: { store },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get store availability
  getStoreAvailability = async (req: Request, res: Response): Promise<void> => {
    try {
      const { storeId } = req.params;

      const validatedParams = storeAvailabilitySchema.parse({ storeId });

      const availability = await this.storeService.getStoreAvailability(validatedParams.storeId);

      res.json({
        success: true,
        data: { availability },
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
        res.status(404).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get store statistics
  getStoreStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { storeId } = req.params;

      if (!storeId) {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      const stats = await this.storeService.getStoreStats(storeId);

      res.json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Search stores
  searchStores = async (req: Request, res: Response): Promise<void> => {
    try {
      const { q, limit } = req.query;

      if (!q || typeof q !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
        return;
      }

      const searchLimit = limit ? parseInt(limit as string) : 10;
      const stores = await this.storeService.searchStores(q, searchLimit);

      res.json({
        success: true,
        data: {
          stores,
          count: stores.length,
          query: q,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get stores by city
  getStoresByCity = async (req: Request, res: Response): Promise<void> => {
    try {
      const { city, state } = req.query;

      if (!city || typeof city !== 'string') {
        res.status(400).json({
          success: false,
          message: 'City is required',
        });
        return;
      }

      const stores = await this.storeService.getStoresByCity(city, state as string | undefined);

      res.json({
        success: true,
        data: {
          stores,
          count: stores.length,
          city,
          state: state || null,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Update store (admin only)
  updateStore = async (req: Request, res: Response): Promise<void> => {
    try {
      const { storeId } = req.params;
      const updateData = req.body;

      if (!storeId) {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      // Validate update data
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        country: z.string().optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        openingHours: z.any().optional(),
        deliveryRadius: z.number().min(0).optional(),
        minOrderAmount: z.number().min(0).optional(),
        isActive: z.boolean().optional(),
      });

      const validatedData = updateSchema.parse(updateData);

      const store = await this.storeService.updateStore(storeId, validatedData);

      res.json({
        success: true,
        message: 'Store updated successfully',
        data: { store },
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

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Create store (admin only)
  createStore = async (req: Request, res: Response): Promise<void> => {
    try {
      const storeData = req.body;

      // Validate store data
      const createSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        country: z.string().optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        openingHours: z.any().optional(),
        deliveryRadius: z.number().min(0).optional(),
        minOrderAmount: z.number().min(0).optional(),
      });

      const validatedData = createSchema.parse(storeData);

      const store = await this.storeService.createStore(validatedData);

      res.status(201).json({
        success: true,
        message: 'Store created successfully',
        data: { store },
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

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}
