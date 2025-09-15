import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const analyticsController = new AnalyticsController();
const authMiddleware = new AuthMiddleware();

router.use(authMiddleware.verifyToken);

router.get('/dashboard', analyticsController.getDashboardStats.bind(analyticsController));
router.get('/sales', analyticsController.getSalesAnalytics.bind(analyticsController));
router.get('/orders', analyticsController.getOrderAnalytics.bind(analyticsController));
router.get('/products', analyticsController.getProductAnalytics.bind(analyticsController));
router.get('/stores', analyticsController.getStoreAnalytics.bind(analyticsController));

export default router;
