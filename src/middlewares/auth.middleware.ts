import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
      };
    }
  }
}

export class AuthMiddleware {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  // Verify access token
  verifyToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          message: 'Access token is required',
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const decoded = this.authService.verifyAccessToken(token);

      if (!decoded) {
        res.status(401).json({
          success: false,
          message: 'Invalid or expired access token',
        });
        return;
      }

      // Get user role from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { role: true, email: true }
      });

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Add user info to request
      req.user = {
        userId: decoded.userId,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Invalid access token',
      });
    }
  };

  // Optional token verification (doesn't fail if no token)
  optionalToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = this.authService.verifyAccessToken(token);

        if (decoded) {
          // Get user role from database
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { role: true, email: true }
          });

          if (user) {
            req.user = {
              userId: decoded.userId,
              email: user.email,
              role: user.role,
            };
          }
        }
      }

      next();
    } catch (error) {
      // Continue without user info if token is invalid
      next();
    }
  };

  // Verify store manager role
  verifyStoreManager = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const storeId = req.params.storeId || req.body.storeId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!storeId) {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      // Check if user is a manager of the store
      const storeManager = await prisma.storeManager.findFirst({
        where: {
          userId,
          storeId,
          isActive: true,
        },
      });

      if (!storeManager) {
        res.status(403).json({
          success: false,
          message: 'Store manager access required',
        });
        return;
      }

      // Add store manager info to request
      (req as any).storeManager = storeManager;

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Require specific roles
  requireRole = (roles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userRole = req.user?.role;

        if (!userRole) {
          res.status(401).json({
            success: false,
            message: 'Authentication required',
          });
          return;
        }

        if (!roles.includes(userRole)) {
          res.status(403).json({
            success: false,
            message: 'Insufficient permissions',
          });
          return;
        }

        next();
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    };
  };
}
