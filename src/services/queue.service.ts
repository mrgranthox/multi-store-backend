import { Queue } from 'bullmq';
import { RedisOptions } from 'ioredis';
import { Worker } from 'bullmq';

const connection: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0,
  // If REDIS_URL is set, prefer it
  ...(process.env.REDIS_URL ? { connectionString: process.env.REDIS_URL } : {}),
};

export const strapiEventQueue = new Queue('strapiEvent', { connection });

export function createStrapiEventWorker(processor: any) {
  return new Worker('strapiEvent', processor, { connection });
}
