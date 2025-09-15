import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const settingsController = new SettingsController();
const authMiddleware = new AuthMiddleware();

// All settings routes require admin authentication
router.use(authMiddleware.verifyToken);
router.use(authMiddleware.requireRole(['admin']));

// Settings endpoints
router.get('/', settingsController.getSettings);
router.put('/', settingsController.updateSettings);

export default router;
