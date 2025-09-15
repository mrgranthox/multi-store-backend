import { createClient, RedisClientType } from 'redis';

export class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: retries => {
          if (retries > 10) {
            console.error('[Cache] Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    this.client.on('error', err => {
      console.error('[Cache] Redis error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('[Cache] Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      console.log('[Cache] Disconnected from Redis');
      this.isConnected = false;
    });
  }

  // Connect to Redis
  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        this.isConnected = true;
      } catch (error) {
        console.error('[Cache] Failed to connect to Redis:', error);
        throw error;
      }
    }
  }

  // Disconnect from Redis
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  // Get value from cache
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('[Cache] Error getting key:', key, error);
      return null;
    }
  }

  // Set value in cache with TTL
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const serializedValue = JSON.stringify(value);

      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }

      return true;
    } catch (error) {
      console.error('[Cache] Error setting key:', key, error);
      return false;
    }
  }

  // Delete key from cache
  async delete(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error('[Cache] Error deleting key:', key, error);
      return false;
    }
  }

  // Delete multiple keys
  async deleteMany(keys: string[]): Promise<number> {
    try {
      if (!this.isConnected || keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(keys);
      return result;
    } catch (error) {
      console.error('[Cache] Error deleting keys:', keys, error);
      return 0;
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('[Cache] Error checking key existence:', key, error);
      return false;
    }
  }

  // Get TTL for key
  async getTTL(key: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return -1;
      }

      return await this.client.ttl(key);
    } catch (error) {
      console.error('[Cache] Error getting TTL for key:', key, error);
      return -1;
    }
  }

  // Set TTL for existing key
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.expire(key, ttlSeconds);
      return result;
    } catch (error) {
      console.error('[Cache] Error setting TTL for key:', key, error);
      return false;
    }
  }

  // Get or set with fallback function
  async getOrSet<T>(key: string, fallbackFn: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, execute fallback function
      const value = await fallbackFn();

      // Store in cache
      await this.set(key, value, ttlSeconds);

      return value;
    } catch (error) {
      console.error('[Cache] Error in getOrSet:', key, error);
      // If cache fails, still return the fallback result
      return await fallbackFn();
    }
  }

  // Clear cache by pattern
  async clearPattern(pattern: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      return await this.deleteMany(keys);
    } catch (error) {
      console.error('[Cache] Error clearing pattern:', pattern, error);
      return 0;
    }
  }

  // Get cache statistics
  async getStats(): Promise<{
    connected: boolean;
    memory: any;
    keyspace: any;
  }> {
    try {
      if (!this.isConnected) {
        return {
          connected: false,
          memory: null,
          keyspace: null,
        };
      }

      const memory = await this.client.memoryUsage('*');
      const keyspace = await this.client.info('keyspace');

      return {
        connected: true,
        memory,
        keyspace,
      };
    } catch (error) {
      console.error('[Cache] Error getting stats:', error);
      return {
        connected: false,
        memory: null,
        keyspace: null,
      };
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.ping();
      return true;
    } catch (error) {
      console.error('[Cache] Health check failed:', error);
      return false;
    }
  }

  // Cache key generators
  static generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  }

  // Store-specific cache keys
  static storeKey(storeId: string): string {
    return this.generateKey('store', storeId);
  }

  static nearbyStoresKey(lat: number, lng: number, radius: number): string {
    return this.generateKey(
      'stores',
      'nearby',
      Math.round(lat * 1000),
      Math.round(lng * 1000),
      radius
    );
  }

  static storeInventoryKey(storeId: string): string {
    return this.generateKey('store', storeId, 'inventory');
  }

  static productKey(productId: string): string {
    return this.generateKey('product', productId);
  }

  static productsKey(filters: Record<string, any>): string {
    const filterStr = Object.entries(filters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return this.generateKey('products', filterStr);
  }

  static categoryKey(categoryId: string): string {
    return this.generateKey('category', categoryId);
  }

  static searchKey(query: string, filters: Record<string, any> = {}): string {
    const filterStr = Object.entries(filters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return this.generateKey('search', query, filterStr);
  }
}

// Export singleton instance
export const cacheService = new CacheService();
