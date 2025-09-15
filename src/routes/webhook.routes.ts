import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();
const webhookController = new WebhookController();

// Webhook endpoints (no auth required - verified by HMAC signature)
router.post('/inventory-updated', webhookController.inventoryUpdated);
router.post('/product-updated', webhookController.productUpdated);
router.post('/promotion-updated', webhookController.promotionUpdated);

// Health check
router.get('/health', webhookController.healthCheck);

export default router;
