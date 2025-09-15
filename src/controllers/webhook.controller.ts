import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../db/prisma';
import { StrapiService } from '../services/strapi.service';
import { strapiEventQueue } from '../services/queue.service';

// Webhook validation schemas
const webhookHeadersSchema = z.object({
  'x-hook-signature': z.string().optional(),
  authorization: z.string().optional(),
});

const inventoryUpdateSchema = z.object({
  data: z.object({
    id: z.number(),
    attributes: z.object({
      productId: z.string(),
      storeId: z.string(),
      quantityAvailable: z.number(),
      reservedQuantity: z.number().optional(),
      isAvailable: z.boolean().optional(),
      priceOverride: z.number().optional(),
      lastRestocked: z.string().optional(),
    }),
  }),
  event: z.enum(['entry.create', 'entry.update', 'entry.delete']),
});

const productUpdateSchema = z.object({
  data: z.object({
    id: z.number(),
    attributes: z.object({
      name: z.string(),
      description: z.string().optional(),
      price: z.number(),
      sku: z.string().optional(),
      isActive: z.boolean().optional(),
      featured: z.boolean().optional(),
    }),
  }),
  event: z.enum([
    'entry.create',
    'entry.update',
    'entry.delete',
    'entry.publish',
    'entry.unpublish',
  ]),
});

const promotionUpdateSchema = z.object({
  data: z.object({
    id: z.number(),
    attributes: z.object({
      name: z.string(),
      description: z.string().optional(),
      discountType: z.enum(['percentage', 'fixed']),
      discountValue: z.number(),
      isActive: z.boolean().optional(),
      startDate: z.string(),
      endDate: z.string(),
    }),
  }),
  event: z.enum([
    'entry.create',
    'entry.update',
    'entry.delete',
    'entry.publish',
    'entry.unpublish',
  ]),
});

// Add helper to compute request hash
function computeRequestHash(payload: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export class WebhookController {
  private strapiService: StrapiService;
  private webhookSecret: string;

  constructor() {
    this.strapiService = new StrapiService();
    this.webhookSecret = process.env.STRAPI_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';

    if (!this.webhookSecret) {
      console.warn('[Webhook] No webhook secret configured - webhooks will not be verified');
    }
  }

  // Verify webhook signature
  private verifySignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return true; // Skip verification if no secret configured
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('[Webhook] Signature verification error:', error);
      return false;
    }
  }

  // Handle inventory updates from Strapi
  inventoryUpdated = async (req: Request, res: Response): Promise<void> => {
    try {
      const headers = webhookHeadersSchema.parse(req.headers);
      const signature = headers['x-hook-signature'] || headers['authorization']?.replace('Bearer ', '');
      if (signature && !this.verifySignature(JSON.stringify(req.body), signature)) {
        res.status(401).json({ success: false, message: 'Invalid webhook signature' });
        return;
      }
      const payload = inventoryUpdateSchema.parse(req.body);
      const requestHash = computeRequestHash(payload);
      // Check idempotency
      const existing = await prisma.idempotencyKey.findFirst({ where: { requestHash } });
      if (existing && existing.status === 'completed') {
        res.status(202).json({ success: true, message: 'Already processed' });
        return;
      }
      // Enqueue job
      await strapiEventQueue.add('inventory', { type: 'inventory', payload, requestHash });
      this.strapiService.clearCacheEntry('inventory');
      res.status(202).json({ success: true, message: 'Inventory update enqueued' });
    } catch (error) {
      console.error('[Webhook] Inventory update error:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid webhook payload',
          errors: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Handle product updates from Strapi
  productUpdated = async (req: Request, res: Response): Promise<void> => {
    try {
      const headers = webhookHeadersSchema.parse(req.headers);
      const signature = headers['x-hook-signature'] || headers['authorization']?.replace('Bearer ', '');
      if (signature && !this.verifySignature(JSON.stringify(req.body), signature)) {
        res.status(401).json({ success: false, message: 'Invalid webhook signature' });
        return;
      }
      const payload = productUpdateSchema.parse(req.body);
      const requestHash = computeRequestHash(payload);
      const existing = await prisma.idempotencyKey.findFirst({ where: { requestHash } });
      if (existing && existing.status === 'completed') {
        res.status(202).json({ success: true, message: 'Already processed' });
        return;
      }
      await strapiEventQueue.add('product', { type: 'product', payload, requestHash });
      this.strapiService.clearCacheEntry('products');
      res.status(202).json({ success: true, message: 'Product update enqueued' });
    } catch (error) {
      console.error('[Webhook] Product update error:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid webhook payload',
          errors: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Handle promotion updates from Strapi
  promotionUpdated = async (req: Request, res: Response): Promise<void> => {
    try {
      const headers = webhookHeadersSchema.parse(req.headers);
      const signature = headers['x-hook-signature'] || headers['authorization']?.replace('Bearer ', '');
      if (signature && !this.verifySignature(JSON.stringify(req.body), signature)) {
        res.status(401).json({ success: false, message: 'Invalid webhook signature' });
        return;
      }
      const payload = promotionUpdateSchema.parse(req.body);
      const requestHash = computeRequestHash(payload);
      const existing = await prisma.idempotencyKey.findFirst({ where: { requestHash } });
      if (existing && existing.status === 'completed') {
        res.status(202).json({ success: true, message: 'Already processed' });
        return;
      }
      await strapiEventQueue.add('promotion', { type: 'promotion', payload, requestHash });
      this.strapiService.clearCacheEntry('promotions');
      res.status(202).json({ success: true, message: 'Promotion update enqueued' });
    } catch (error) {
      console.error('[Webhook] Promotion update error:', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid webhook payload',
          errors: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Health check for webhooks
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const strapiHealth = await this.strapiService.healthCheck();

      res.json({
        success: true,
        data: {
          webhookSecret: !!this.webhookSecret,
          strapiConnection: strapiHealth,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Webhook health check failed',
      });
    }
  };
}
