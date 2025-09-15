import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { AuthController } from '../controllers/auth.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const userController = new UserController();
const authController = new AuthController();
const authMiddleware = new AuthMiddleware();

// User profile routes (authenticated users)
router.get('/profile', authMiddleware.verifyToken, authController.getProfile);
router.put('/profile', authMiddleware.verifyToken, authController.updateProfile);

// Admin user management routes
router.get('/', authMiddleware.verifyToken, authMiddleware.requireRole(['admin']), userController.getAllUsers);
router.get('/:id', authMiddleware.verifyToken, authMiddleware.requireRole(['admin']), userController.getUserById);
router.post('/', authMiddleware.verifyToken, authMiddleware.requireRole(['admin']), userController.createUser);
router.put('/:id', authMiddleware.verifyToken, authMiddleware.requireRole(['admin']), userController.updateUser);
router.delete('/:id', authMiddleware.verifyToken, authMiddleware.requireRole(['admin']), userController.deleteUser);

export default router;
