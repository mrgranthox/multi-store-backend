import { Request, Response } from 'express';
import {
  AuthService,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '../services/auth.service';
import { z } from 'zod';
import { ApiResponseUtil } from '../utils/api-response';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  // Register new user
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = registerSchema.parse(req.body);

      // Register user
      const result = await this.authService.register(validatedData);

      ApiResponseUtil.created(res, {
        user: result.user,
        tokens: result.tokens,
      }, 'User registered successfully');
    } catch (error) {
      if (error instanceof z.ZodError) {
        ApiResponseUtil.validationError(res, error, 'Validation failed');
        return;
      }

      if (error instanceof Error) {
        ApiResponseUtil.badRequest(res, error.message);
        return;
      }

      ApiResponseUtil.internalError(res, 'Internal server error', error);
    }
  };

  // Login user
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = loginSchema.parse(req.body);

      // Extract device info from request
      const deviceInfo = {
        deviceType: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop',
        deviceId: req.headers['x-device-id'] as string,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      // Login user
      const result = await this.authService.login(
        validatedData.email,
        validatedData.password,
        deviceInfo
      );

      ApiResponseUtil.success(res, {
        user: result.user,
        tokens: result.tokens,
      }, 'Login successful');
    } catch (error) {
      if (error instanceof z.ZodError) {
        ApiResponseUtil.validationError(res, error, 'Validation failed');
        return;
      }

      if (error instanceof Error) {
        ApiResponseUtil.unauthorized(res, error.message);
        return;
      }

      ApiResponseUtil.internalError(res, 'Internal server error', error);
    }
  };

  // Refresh tokens
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = refreshTokenSchema.parse(req.body);

      // Refresh tokens
      const tokens = await this.authService.refreshTokens(validatedData.refreshToken);

      res.json({
        success: true,
        message: 'Tokens refreshed successfully',
        data: {
          tokens,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error) {
        res.status(401).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Logout user
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const refreshToken = req.body.refreshToken;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
        return;
      }

      // Logout user
      await this.authService.logout(refreshToken);

      res.json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get current user profile
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const user = await this.authService.getUserById(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          user,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Update user profile
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      // Validate update data
      const updateSchema = z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        phone: z.string().min(10).optional(),
        profileImage: z.string().url().optional(),
      });

      const validatedData = updateSchema.parse(req.body);

      // Update user profile
      const user = await this.authService.updateProfile(userId, validatedData);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}
