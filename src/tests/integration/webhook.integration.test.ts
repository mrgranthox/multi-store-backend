import request from 'supertest';
import app from '../../app';
import { WebhookController } from '../../controllers/webhook.controller';

describe('Webhook Integration Tests', () => {
  const webhookSecret = process.env.WEBHOOK_SECRET || 'webhook-secret-key-12345';

  describe('POST /webhooks/product-updated', () => {
    it('should handle product creation webhook', async () => {
      const webhookPayload = {
        event: 'entry.create',
        data: {
          id: 1,
          attributes: {
            name: 'Test Product',
            price: 29.99,
            sku: 'TEST-001',
            isActive: true,
          },
        },
        timestamp: new Date().toISOString(),
        source: 'strapi-cms',
      };

      const response = await request(app)
        .post('/webhooks/product-updated')
        .set('X-Webhook-Secret', webhookSecret)
        .send(webhookPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Product update processed successfully');
    });

    it('should handle product update webhook', async () => {
      const webhookPayload = {
        event: 'entry.update',
        data: {
          id: 1,
          attributes: {
            name: 'Updated Test Product',
            price: 39.99,
            sku: 'TEST-001',
            isActive: true,
          },
        },
        timestamp: new Date().toISOString(),
        source: 'strapi-cms',
      };

      const response = await request(app)
        .post('/webhooks/product-updated')
        .set('X-Webhook-Secret', webhookSecret)
        .send(webhookPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject webhook with invalid signature', async () => {
      const webhookPayload = {
        event: 'entry.create',
        data: {
          id: 1,
          attributes: {
            name: 'Test Product',
            price: 29.99,
            sku: 'TEST-001',
            isActive: true,
          },
        },
        timestamp: new Date().toISOString(),
        source: 'strapi-cms',
      };

      const response = await request(app)
        .post('/webhooks/product-updated')
        .set('X-Webhook-Secret', 'invalid-secret')
        .send(webhookPayload)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should reject webhook with invalid payload', async () => {
      const invalidPayload = {
        event: 'invalid-event',
        data: {
          id: 'invalid-id',
        },
      };

      const response = await request(app)
        .post('/webhooks/product-updated')
        .set('X-Webhook-Secret', webhookSecret)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid webhook payload');
    });
  });

  describe('POST /webhooks/promotion-updated', () => {
    it('should handle promotion creation webhook', async () => {
      const webhookPayload = {
        event: 'entry.create',
        data: {
          id: 1,
          attributes: {
            name: 'Test Promotion',
            discountType: 'percentage',
            discountValue: 20,
            isActive: true,
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
        timestamp: new Date().toISOString(),
        source: 'strapi-cms',
      };

      const response = await request(app)
        .post('/webhooks/promotion-updated')
        .set('X-Webhook-Secret', webhookSecret)
        .send(webhookPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Promotion update processed successfully');
    });
  });

  describe('POST /webhooks/inventory-updated', () => {
    it('should handle inventory creation webhook', async () => {
      const webhookPayload = {
        event: 'entry.create',
        data: {
          id: 1,
          attributes: {
            productId: 'test-product-123',
            storeId: 'test-store-456',
            quantityAvailable: 100,
            reservedQuantity: 0,
            isAvailable: true,
          },
        },
        timestamp: new Date().toISOString(),
        source: 'strapi-cms',
      };

      const response = await request(app)
        .post('/webhooks/inventory-updated')
        .set('X-Webhook-Secret', webhookSecret)
        .send(webhookPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Inventory update processed successfully');
    });
  });

  describe('GET /webhooks/health', () => {
    it('should return webhook health status', async () => {
      const response = await request(app)
        .get('/webhooks/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('webhookSecret');
      expect(response.body.data).toHaveProperty('strapiConnection');
      expect(response.body.data).toHaveProperty('timestamp');
    });
  });
});
