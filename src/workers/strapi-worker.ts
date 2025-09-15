import { createStrapiEventWorker } from '../services/queue.service';
import prisma from '../db/prisma';
import { QueueEvents, Queue } from 'bullmq';
import { strapiEventQueue } from '../services/queue.service';

async function processInventoryEvent(tx: any, payload: any) {
  const { data } = payload;
  const attrs = data.attributes;
  // Find local product by strapiId
  const product = await tx.product.findUnique({ where: { strapiId: parseInt(attrs.productId, 10) } });
  if (!product) throw new Error(`Product with strapiId ${attrs.productId} not found`);
  await tx.storeInventory.upsert({
    where: {
      storeId_productId: {
        storeId: attrs.storeId,
        productId: product.id,
      },
    },
    update: {
      quantityAvailable: attrs.quantityAvailable,
      reservedQuantity: attrs.reservedQuantity || 0,
      isAvailable: attrs.isAvailable !== undefined ? attrs.isAvailable : true,
      priceOverride: attrs.priceOverride ? Number(attrs.priceOverride) : null,
      lastRestocked: attrs.lastRestocked ? new Date(attrs.lastRestocked) : null,
      updatedAt: new Date(),
    },
    create: {
      storeId: attrs.storeId,
      productId: product.id,
      quantityAvailable: attrs.quantityAvailable,
      reservedQuantity: attrs.reservedQuantity || 0,
      isAvailable: attrs.isAvailable !== undefined ? attrs.isAvailable : true,
      priceOverride: attrs.priceOverride ? Number(attrs.priceOverride) : null,
      lastRestocked: attrs.lastRestocked ? new Date(attrs.lastRestocked) : null,
    },
  });
}

async function processProductEvent(tx: any, payload: any) {
  const { data } = payload;
  const attrs = data.attributes;
  await tx.product.upsert({
    where: { strapiId: data.id },
    update: {
      name: attrs.name,
      description: attrs.description || '',
      price: Number(attrs.price),
      sku: attrs.sku || null,
      isActive: attrs.isActive !== undefined ? attrs.isActive : true,
      featured: attrs.featured !== undefined ? attrs.featured : false,
      updatedAt: new Date(),
    },
    create: {
      strapiId: data.id,
      name: attrs.name,
      description: attrs.description || '',
      price: Number(attrs.price),
      sku: attrs.sku || null,
      isActive: attrs.isActive !== undefined ? attrs.isActive : true,
      featured: attrs.featured !== undefined ? attrs.featured : false,
    },
  });
}

async function processPromotionEvent(tx: any, payload: any) {
  const { data } = payload;
  const attrs = data.attributes;
  await tx.promotion.upsert({
    where: { strapiId: data.id },
    update: {
      name: attrs.name,
      description: attrs.description || '',
      discountType: attrs.discountType,
      discountValue: Number(attrs.discountValue),
      isActive: attrs.isActive !== undefined ? attrs.isActive : true,
      startDate: attrs.startDate ? new Date(attrs.startDate) : null,
      endDate: attrs.endDate ? new Date(attrs.endDate) : null,
      updatedAt: new Date(),
    },
    create: {
      strapiId: data.id,
      name: attrs.name,
      description: attrs.description || '',
      discountType: attrs.discountType,
      discountValue: Number(attrs.discountValue),
      isActive: attrs.isActive !== undefined ? attrs.isActive : true,
      startDate: attrs.startDate ? new Date(attrs.startDate) : null,
      endDate: attrs.endDate ? new Date(attrs.endDate) : null,
    },
  });
}

async function processStrapiEvent(job: any) {
  const { type, payload, requestHash } = job.data;
  try {
    return await prisma.$transaction(async (tx) => {
      // Idempotency check
      let idempotency = await tx.idempotencyKey.findFirst({ where: { requestHash } });
      if (idempotency && idempotency.status === 'completed') {
        return { status: 'already_processed' };
      }
      if (!idempotency) {
        idempotency = await tx.idempotencyKey.create({
          data: { key: requestHash, requestHash, status: 'in_progress' },
        });
      }
      // Process event
      switch (type) {
        case 'inventory':
          await processInventoryEvent(tx, payload);
          break;
        case 'product':
          await processProductEvent(tx, payload);
          break;
        case 'promotion':
          await processPromotionEvent(tx, payload);
          break;
        default:
          throw new Error(`Unknown strapi event type: ${type}`);
      }
      // Mark idempotency completed
      await tx.idempotencyKey.update({
        where: { id: idempotency.id },
        data: { status: 'completed' },
      });
      return { status: 'processed' };
    });
  } catch (error) {
    // Mark idempotency failed
    await prisma.idempotencyKey.upsert({
      where: { key: requestHash },
      update: { status: 'failed' },
      create: { key: requestHash, requestHash, status: 'failed' },
    });
    console.error('[StrapiWorker] Job failed:', error);
    throw error;
  }
}

const worker = createStrapiEventWorker(processStrapiEvent);

// Poison queue/dead-letter handling
const queueEvents = new QueueEvents('strapiEvent', { connection: strapiEventQueue.opts.connection });
queueEvents.on('failed', async ({ jobId, failedReason }) => {
  console.error(`[StrapiWorker] Job ${jobId} failed:`, failedReason);
  // Optionally, move to a dead-letter queue or notify ops
});

worker.on('error', (err) => {
  console.error('[StrapiWorker] Worker error:', err);
});

worker.on('failed', (job, err) => {
  console.error(`[StrapiWorker] Job ${job.id} failed after retries:`, err);
});
