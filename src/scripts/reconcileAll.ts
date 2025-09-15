import { StrapiService } from '../services/strapi.service';

(async () => {
  const strapiService = new StrapiService();
  try {
    console.log('[Reconcile] Starting full reconciliation for products...');
    await strapiService.reconcileAll('products');
    console.log('[Reconcile] Products done. Now categories...');
    await strapiService.reconcileAll('categories');
    console.log('[Reconcile] Categories done.');
    process.exit(0);
  } catch (error) {
    console.error('[Reconcile] Error:', error);
    process.exit(1);
  }
})();
