import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const inventoryController = new InventoryController();
const authMiddleware = new AuthMiddleware();

// All inventory routes require authentication
router.use(authMiddleware.verifyToken);

// Inventory endpoints
router.get('/', inventoryController.getInventory);
router.get('/low-stock', inventoryController.getLowStockItems);
router.get('/:id', inventoryController.getInventoryById);
router.put('/:id', inventoryController.updateInventory);

export default router;
