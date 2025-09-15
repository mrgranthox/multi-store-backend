import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import prisma from '../db/prisma';

// Strapi API response schemas
const strapiProductSchema = z.object({
  id: z.number(),
  attributes: z.object({
    name: z.string(),
    description: z.string().optional(),
    price: z.number(),
    sku: z.string().optional(),
    images: z.array(z.string()).optional(),
    category: z.object({
      data: z
        .object({
          id: z.number(),
          attributes: z.object({
            name: z.string(),
            slug: z.string(),
          }),
        })
        .optional(),
    }),
    variants: z
      .array(
        z.object({
          id: z.number(),
          name: z.string(),
          price: z.number(),
          sku: z.string().optional(),
        })
      )
      .optional(),
    isActive: z.boolean().default(true),
    featured: z.boolean().default(false),
    publishedAt: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

const strapiCategorySchema = z.object({
  id: z.number(),
  attributes: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    image: z.string().optional(),
    isActive: z.boolean().default(true),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

const strapiBannerSchema = z.object({
  id: z.number(),
  attributes: z.object({
    title: z.string(),
    description: z.string().optional(),
    image: z.string(),
    link: z.string().optional(),
    isActive: z.boolean().default(true),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

const strapiPromotionSchema = z.object({
  id: z.number(),
  attributes: z.object({
    name: z.string(),
    description: z.string().optional(),
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: z.number(),
    minOrderAmount: z.number().optional(),
    maxDiscountAmount: z.number().optional(),
    code: z.string().optional(),
    isActive: z.boolean().default(true),
    startDate: z.string(),
    endDate: z.string(),
    applicableProducts: z.array(z.number()).optional(),
    applicableCategories: z.array(z.number()).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

// Types
export type StrapiProduct = z.infer<typeof strapiProductSchema>;
export type StrapiCategory = z.infer<typeof strapiCategorySchema>;
export type StrapiBanner = z.infer<typeof strapiBannerSchema>;
export type StrapiPromotion = z.infer<typeof strapiPromotionSchema>;

export interface StrapiApiResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

export interface StrapiQueryParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  filters?: Record<string, any>;
  populate?: string | string[];
}

// MANUAL: Create sync_meta table to track lastSyncedAt per model
// Example SQL:
// CREATE TABLE IF NOT EXISTS "backend"."sync_meta" (
//   id SERIAL PRIMARY KEY,
//   model TEXT UNIQUE NOT NULL,
//   lastSyncedAt TIMESTAMP NOT NULL DEFAULT NOW()
// );

// Service class
export class StrapiService {
  private client: AxiosInstance;
  private baseUrl: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.baseUrl = process.env.STRAPI_BASE_URL || 'http://localhost:1337';

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      config => {
        console.log(`[Strapi] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      error => {
        console.error('[Strapi] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error('[Strapi] Response error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // Generic method to fetch data from Strapi with caching
  private async fetchWithCache<T>(
    endpoint: string,
    params?: any,
    useCache: boolean = true
  ): Promise<T> {
    const cacheKey = `${endpoint}:${JSON.stringify(params || {})}`;

    // Check cache first
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`[Strapi] Cache hit for ${endpoint}`);
        return cached.data;
      }
    }

    try {
      const response = await this.client.get(endpoint, { params });
      const data = response.data;

      // Cache the result
      if (useCache) {
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
        });
      }

      return data;
    } catch (error) {
      console.error(`[Strapi] Error fetching ${endpoint}:`, error);
      throw error;
    }
  }

  // Get products from Strapi
  async getProducts(params?: StrapiQueryParams): Promise<StrapiApiResponse<StrapiProduct>> {
    const queryParams = {
      'pagination[page]': params?.page || 1,
      'pagination[pageSize]': params?.pageSize || 25,
      sort: params?.sort || 'createdAt:desc',
      populate: params?.populate || ['category', 'images'],
      ...params?.filters,
    };

    return this.fetchWithCache<StrapiApiResponse<StrapiProduct>>('/api/products', queryParams);
  }

  // Get product by ID
  async getProductById(id: number): Promise<{ data: StrapiProduct }> {
    return this.fetchWithCache<{ data: StrapiProduct }>(`/api/products/${id}`, {
      populate: ['category', 'images', 'variants'],
    });
  }

  // Get products by store (if store-specific products exist)
  async getProductsByStore(
    storeId: string,
    params?: StrapiQueryParams
  ): Promise<StrapiApiResponse<StrapiProduct>> {
    const queryParams = {
      'pagination[page]': params?.page || 1,
      'pagination[pageSize]': params?.pageSize || 25,
      sort: params?.sort || 'createdAt:desc',
      populate: params?.populate || ['category', 'images'],
      'filters[store][id][$eq]': storeId,
      ...params?.filters,
    };

    return this.fetchWithCache<StrapiApiResponse<StrapiProduct>>('/api/products', queryParams);
  }

  // Get categories
  async getCategories(params?: StrapiQueryParams): Promise<StrapiApiResponse<StrapiCategory>> {
    const queryParams = {
      'pagination[page]': params?.page || 1,
      'pagination[pageSize]': params?.pageSize || 50,
      sort: params?.sort || 'name:asc',
      populate: params?.populate || ['image'],
      ...params?.filters,
    };

    return this.fetchWithCache<StrapiApiResponse<StrapiCategory>>('/api/categories', queryParams);
  }

  // Get banners
  async getBanners(params?: StrapiQueryParams): Promise<StrapiApiResponse<StrapiBanner>> {
    const queryParams = {
      'pagination[page]': params?.page || 1,
      'pagination[pageSize]': params?.pageSize || 10,
      sort: params?.sort || 'createdAt:desc',
      'filters[isActive][$eq]': true,
      ...params?.filters,
    };

    return this.fetchWithCache<StrapiApiResponse<StrapiBanner>>('/api/banners', queryParams);
  }

  // Get promotions
  async getPromotions(params?: StrapiQueryParams): Promise<StrapiApiResponse<StrapiPromotion>> {
    const now = new Date().toISOString();
    const queryParams = {
      'pagination[page]': params?.page || 1,
      'pagination[pageSize]': params?.pageSize || 20,
      sort: params?.sort || 'createdAt:desc',
      'filters[isActive][$eq]': true,
      'filters[startDate][$lte]': now,
      'filters[endDate][$gte]': now,
      ...params?.filters,
    };

    return this.fetchWithCache<StrapiApiResponse<StrapiPromotion>>('/api/promotions', queryParams);
  }

  // Search products
  async searchProducts(
    query: string,
    params?: StrapiQueryParams
  ): Promise<StrapiApiResponse<StrapiProduct>> {
    const queryParams = {
      'pagination[page]': params?.page || 1,
      'pagination[pageSize]': params?.pageSize || 25,
      sort: params?.sort || 'createdAt:desc',
      populate: params?.populate || ['category', 'images'],
      'filters[$or][0][name][$containsi]': query,
      'filters[$or][1][description][$containsi]': query,
      'filters[$or][2][sku][$containsi]': query,
      ...params?.filters,
    };

    return this.fetchWithCache<StrapiApiResponse<StrapiProduct>>('/api/products', queryParams);
  }

  // Get featured products
  async getFeaturedProducts(params?: StrapiQueryParams): Promise<StrapiApiResponse<StrapiProduct>> {
    const queryParams = {
      'pagination[page]': params?.page || 1,
      'pagination[pageSize]': params?.pageSize || 10,
      sort: params?.sort || 'createdAt:desc',
      populate: params?.populate || ['category', 'images'],
      'filters[featured][$eq]': true,
      'filters[isActive][$eq]': true,
      ...params?.filters,
    };

    return this.fetchWithCache<StrapiApiResponse<StrapiProduct>>('/api/products', queryParams);
  }

  // Get products by category
  async getProductsByCategory(
    categoryId: number,
    params?: StrapiQueryParams
  ): Promise<StrapiApiResponse<StrapiProduct>> {
    const queryParams = {
      'pagination[page]': params?.page || 1,
      'pagination[pageSize]': params?.pageSize || 25,
      sort: params?.sort || 'createdAt:desc',
      populate: params?.populate || ['category', 'images'],
      'filters[category][id][$eq]': categoryId,
      'filters[isActive][$eq]': true,
      ...params?.filters,
    };

    return this.fetchWithCache<StrapiApiResponse<StrapiProduct>>('/api/products', queryParams);
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
    console.log('[Strapi] Cache cleared');
  }

  // Clear specific cache entry
  clearCacheEntry(pattern: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => key.includes(pattern));
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`[Strapi] Cleared ${keysToDelete.length} cache entries matching "${pattern}"`);
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/api/health');
      return true;
    } catch (error) {
      console.error('[Strapi] Health check failed:', error);
      return false;
    }
  }

  // Retry mechanism for failed requests
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          console.log(`[Strapi] Retry ${i + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }

    throw lastError!;
  }

  // Fetch all products from Strapi, paginated
  async fetchAllProducts(page: number = 1, pageSize: number = 100): Promise<StrapiProduct[]> {
    let all: StrapiProduct[] = [];
    let currentPage = page;
    let totalPages = 1;
    do {
      const resp = await this.getProducts({ page: currentPage, pageSize });
      all = all.concat(resp.data);
      totalPages = resp.meta.pagination.pageCount;
      currentPage++;
    } while (currentPage <= totalPages);
    return all;
  }

  // Fetch product by Strapi ID
  async fetchProductByStrapiId(id: number): Promise<StrapiProduct | null> {
    try {
      const resp = await this.getProductById(id);
      return resp.data;
    } catch {
      return null;
    }
  }

  // Fetch all categories from Strapi, paginated
  async fetchAllCategories(page: number = 1, pageSize: number = 100): Promise<StrapiCategory[]> {
    let all: StrapiCategory[] = [];
    let currentPage = page;
    let totalPages = 1;
    do {
      const resp = await this.getCategories({ page: currentPage, pageSize });
      all = all.concat(resp.data);
      totalPages = resp.meta.pagination.pageCount;
      currentPage++;
    } while (currentPage <= totalPages);
    return all;
  }

  // Reconcile all records for a given model (products, categories, etc.)
  async reconcileAll(model: 'products' | 'categories' | 'banners' | 'promotions') {
    // Placeholder: implement paging through Strapi and upserting into Postgres
    // Example for products:
    if (model === 'products') {
      const products = await this.fetchAllProducts();
      for (const product of products) {
        await prisma.product.upsert({
          where: { strapiId: product.id },
          update: {
            name: product.attributes.name,
            description: product.attributes.description || '',
            price: Number(product.attributes.price),
            sku: product.attributes.sku || null,
            isActive: product.attributes.isActive,
            featured: product.attributes.featured,
            updatedAt: new Date(product.attributes.updatedAt),
          },
          create: {
            strapiId: product.id,
            name: product.attributes.name,
            description: product.attributes.description || '',
            price: Number(product.attributes.price),
            sku: product.attributes.sku || null,
            isActive: product.attributes.isActive,
            featured: product.attributes.featured,
            createdAt: new Date(product.attributes.createdAt),
            updatedAt: new Date(product.attributes.updatedAt),
          },
        });
      }
    }
    if (model === 'categories') {
      const categories = await this.fetchAllCategories();
      for (const category of categories) {
        await prisma.category.upsert({
          where: { strapiId: category.id },
          update: {
            name: category.attributes.name,
            slug: category.attributes.slug,
            description: category.attributes.description || '',
            image: category.attributes.image || null,
            isActive: category.attributes.isActive,
            updatedAt: new Date(category.attributes.updatedAt),
          },
          create: {
            strapiId: category.id,
            name: category.attributes.name,
            slug: category.attributes.slug,
            description: category.attributes.description || '',
            image: category.attributes.image || null,
            isActive: category.attributes.isActive,
            createdAt: new Date(category.attributes.createdAt),
            updatedAt: new Date(category.attributes.updatedAt),
          },
        });
      }
    }
    // TODO: Add banners and promotions
    await prisma.$executeRaw`INSERT INTO "backend"."sync_meta" (model, lastSyncedAt)
      VALUES (${model}, NOW())
      ON CONFLICT (model) DO UPDATE SET lastSyncedAt = EXCLUDED.lastSyncedAt;`;
  }
}
