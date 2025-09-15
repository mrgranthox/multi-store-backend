import { Request, Response } from 'express';
import { z } from 'zod';
import { StrapiService } from '../services/strapi.service';
import prisma from '../db/prisma';

// Validation schemas
const productQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  featured: z.enum(['true', 'false']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
  sort: z.enum(['name', 'price', 'createdAt', 'featured']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export class ProductController {
  private strapiService: StrapiService;

  constructor() {
    this.strapiService = new StrapiService();
  }

  // Get products with inventory mapping
  getProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate query parameters
      const validatedQuery = productQuerySchema.parse(req.query);
      const {
        storeId,
        category,
        search,
        featured,
        isActive,
        limit = 25,
        offset = 0,
        sort = 'createdAt',
        order = 'desc',
      } = validatedQuery;

      // Build Prisma query
      const prismaWhere: any = {};
      if (category) {
        // Find category by slug
        const cat = await prisma.category.findFirst({ where: { slug: category } });
        if (cat) prismaWhere.categoryId = cat.id;
      }
      if (featured === 'true') prismaWhere.featured = true;
      if (isActive === 'true') prismaWhere.isActive = true;
      if (search) {
        prismaWhere.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ];
      }
      // Fetch from Prisma
      let products = await prisma.product.findMany({
        where: prismaWhere,
        orderBy: { [sort]: order },
        skip: offset,
        take: limit,
        include: { category: true },
      });
      // If empty, fallback to Strapi and trigger reconciliation
      if (!products || products.length === 0) {
        await this.strapiService.reconcileAll('products');
        products = await prisma.product.findMany({
          where: prismaWhere,
          orderBy: { [sort]: order },
          skip: offset,
          take: limit,
          include: { category: true },
        });
      }
      // Map with inventory if storeId provided
      let productsWithInventory = products;
      if (storeId) {
        productsWithInventory = await this.mapProductsWithInventoryPrisma(products, storeId);
      }
      res.json({
        success: true,
        data: {
          products: productsWithInventory,
          pagination: {
            page: Math.floor(offset / limit) + 1,
            pageSize: limit,
            pageCount: 1, // Not paginating full count for now
            total: products.length,
          },
          filters: {
            storeId: storeId || null,
            category: category || null,
            search: search || null,
            featured: featured === 'true',
            isActive: isActive === 'true',
          },
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

      console.error('[Product] Error fetching products:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get product by ID with inventory
  getProductById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { productId } = req.params;
      const { storeId } = req.query;

      if (!productId) {
        res.status(400).json({
          success: false,
          message: 'Product ID is required',
        });
        return;
      }

      // Try Prisma first
      let product = await prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
      if (!product) {
        // Fallback to Strapi and trigger reconciliation
        const strapiProduct = await this.strapiService.fetchProductByStrapiId(parseInt(productId));
        await this.strapiService.reconcileAll('products');
        product = await prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
        if (!product && strapiProduct) {
          // Return Strapi product if still not found
          return res.json({ success: true, data: { product: strapiProduct } });
        }
      }
      // Map with inventory if storeId provided
      let productWithInventory: any = product;
      if (storeId && typeof storeId === 'string') {
        const inventory = await this.getProductInventoryPrisma(product.id, storeId);
        productWithInventory = { ...product, inventory };
      }

      res.json({
        success: true,
        data: { product: productWithInventory },
      });
    } catch (error) {
      console.error('[Product] Error fetching product:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Search products
  searchProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { q, storeId, limit = 25 } = req.query;

      if (!q || typeof q !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
        return;
      }

      // Search products in Strapi
      const strapiResponse = await this.strapiService.searchProducts(q, {
        pageSize: parseInt(limit as string) || 25,
        populate: ['category', 'images'],
      });

      const products = strapiResponse.data;

      // Map with inventory if storeId provided
      let productsWithInventory = products;
      if (storeId && typeof storeId === 'string') {
        productsWithInventory = await this.mapProductsWithInventory(products, storeId);
      }

      res.json({
        success: true,
        data: {
          products: productsWithInventory,
          query: q,
          count: products.length,
          pagination: strapiResponse.meta.pagination,
        },
      });
    } catch (error) {
      console.error('[Product] Error searching products:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get featured products
  getFeaturedProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { storeId, limit = 10 } = req.query;

      // Fetch featured products from Strapi
      const strapiResponse = await this.strapiService.getFeaturedProducts({
        pageSize: parseInt(limit as string) || 10,
        populate: ['category', 'images'],
      });

      const products = strapiResponse.data;

      // Map with inventory if storeId provided
      let productsWithInventory = products;
      if (storeId && typeof storeId === 'string') {
        productsWithInventory = await this.mapProductsWithInventory(products, storeId);
      }

      res.json({
        success: true,
        data: {
          products: productsWithInventory,
          count: products.length,
        },
      });
    } catch (error) {
      console.error('[Product] Error fetching featured products:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get products by category
  getProductsByCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { categoryId } = req.params;
      const { storeId, limit = 25 } = req.query;

      if (!categoryId) {
        res.status(400).json({
          success: false,
          message: 'Category ID is required',
        });
        return;
      }

      // Fetch products by category from Strapi
      const strapiResponse = await this.strapiService.getProductsByCategory(parseInt(categoryId), {
        pageSize: parseInt(limit as string) || 25,
        populate: ['category', 'images'],
      });

      const products = strapiResponse.data;

      // Map with inventory if storeId provided
      let productsWithInventory = products;
      if (storeId && typeof storeId === 'string') {
        productsWithInventory = await this.mapProductsWithInventory(products, storeId);
      }

      res.json({
        success: true,
        data: {
          products: productsWithInventory,
          categoryId: parseInt(categoryId),
          count: products.length,
          pagination: strapiResponse.meta.pagination,
        },
      });
    } catch (error) {
      console.error('[Product] Error fetching products by category:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get categories
  getCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      const { limit = 50 } = req.query;

      const strapiResponse = await this.strapiService.getCategories({
        pageSize: parseInt(limit as string) || 50,
        populate: ['image'],
      });

      res.json({
        success: true,
        data: {
          categories: strapiResponse.data,
          count: strapiResponse.data.length,
        },
      });
    } catch (error) {
      console.error('[Product] Error fetching categories:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Map products with inventory data
  private async mapProductsWithInventory(products: any[], storeId: string): Promise<any[]> {
    const productIds = products.map(p => p.attributes.name); // Using name as productId for now

    const inventory = await prisma.storeInventory.findMany({
      where: {
        storeId,
        productId: { in: productIds },
      },
    });

    // Create inventory lookup map
    const inventoryMap = new Map();
    inventory.forEach((inv: any) => {
      inventoryMap.set(inv.productId, inv);
    });

    // Map products with inventory
    return products.map(product => {
      const productId = product.attributes.name; // Using name as productId for now
      const inventoryData = inventoryMap.get(productId);

      return {
        ...product,
        inventory: inventoryData
          ? {
              quantityAvailable: inventoryData.quantityAvailable,
              reservedQuantity: inventoryData.reservedQuantity,
              isAvailable: inventoryData.isAvailable,
              priceOverride: inventoryData.priceOverride,
              lastRestocked: inventoryData.lastRestocked,
            }
          : null,
      };
    });
  }

  // Add new helpers for Prisma inventory mapping
  private async mapProductsWithInventoryPrisma(products: any[], storeId: string): Promise<any[]> {
    const productIds = products.map(p => p.id);
    const inventory = await prisma.storeInventory.findMany({
      where: { storeId, productId: { in: productIds } },
    });
    const inventoryMap = new Map();
    inventory.forEach((inv: any) => { inventoryMap.set(inv.productId, inv); });
    return products.map(product => {
      const inventoryData = inventoryMap.get(product.id);
      return {
        ...product,
        inventory: inventoryData
          ? {
              quantityAvailable: inventoryData.quantityAvailable,
              reservedQuantity: inventoryData.reservedQuantity,
              isAvailable: inventoryData.isAvailable,
              priceOverride: inventoryData.priceOverride,
              lastRestocked: inventoryData.lastRestocked,
            }
          : null,
      };
    });
  }
  private async getProductInventoryPrisma(productId: string, storeId: string): Promise<any> {
    const inventory = await prisma.storeInventory.findFirst({ where: { storeId, productId } });
    return inventory
      ? {
          quantityAvailable: inventory.quantityAvailable,
          reservedQuantity: inventory.reservedQuantity,
          isAvailable: inventory.isAvailable,
          priceOverride: inventory.priceOverride,
          lastRestocked: inventory.lastRestocked,
        }
      : null;
  }
}
