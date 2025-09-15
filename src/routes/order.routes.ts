import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const orderController = new OrderController();
const authMiddleware = new AuthMiddleware();

// All order routes require authentication
router.use(authMiddleware.verifyToken);

// Order routes
router.post('/', orderController.createOrder);
router.get('/user', orderController.getOrdersByUser);
router.get('/summary', orderController.getOrderSummary);
router.get('/:orderId', orderController.getOrderById);
router.get('/number/:orderNumber', orderController.getOrderByNumber);
router.put(
  '/:orderId/status',
  authMiddleware.verifyStoreManager,
  orderController.updateOrderStatus
);
router.put('/:orderId/cancel', orderController.cancelOrder);

export default router;
