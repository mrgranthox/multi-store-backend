import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const categoryController = new CategoryController();
const authMiddleware = new AuthMiddleware();

// Public routes
router.get('/', categoryController.getCategories);
router.get('/:id', categoryController.getCategoryById);

// Protected routes (admin/manager only)
router.post('/', authMiddleware.verifyToken, categoryController.createCategory);
router.put('/:id', authMiddleware.verifyToken, categoryController.updateCategory);
router.delete('/:id', authMiddleware.verifyToken, categoryController.deleteCategory);

export default router;
