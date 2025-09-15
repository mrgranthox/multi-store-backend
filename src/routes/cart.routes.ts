import { Router } from 'express';
import { CartController } from '../controllers/cart.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const cartController = new CartController();
const authMiddleware = new AuthMiddleware();

// All cart routes require authentication
router.use(authMiddleware.verifyToken);

// Cart routes
router.get('/', cartController.getCart);
router.post('/items', cartController.addToCart);
router.put('/items/:itemId', cartController.updateCartItem);
router.delete('/items/:itemId', cartController.removeCartItem);
router.delete('/clear', cartController.clearCart);
router.post('/promo-code', cartController.applyPromoCode);
router.get('/summary', cartController.getCartSummary);
router.get('/validate', cartController.validateCart);

export default router;
