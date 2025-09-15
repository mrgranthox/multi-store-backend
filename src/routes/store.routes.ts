import { Router } from 'express';
import { StoreController } from '../controllers/store.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const storeController = new StoreController();
const authMiddleware = new AuthMiddleware();

// Public routes
router.get('/nearby', storeController.getNearbyStores);
router.get('/search', storeController.searchStores);
router.get('/city', storeController.getStoresByCity);
router.get('/:storeId', storeController.getStoreById);
router.get('/:storeId/inventory', storeController.getStoreWithInventory);
router.get('/:storeId/availability', storeController.getStoreAvailability);
router.get('/:storeId/stats', storeController.getStoreStats);

// Protected routes (admin/manager only)
router.post('/', authMiddleware.verifyToken, storeController.createStore);
router.put('/:storeId', authMiddleware.verifyToken, storeController.updateStore);

export default router;
