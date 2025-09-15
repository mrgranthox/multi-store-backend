import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';
import { ApiResponseUtil } from '../utils/api-response';

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  phone: z.string().optional(),
  role: z.enum(['admin', 'manager', 'user']).default('user'),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  phone: z.string().optional(),
  role: z.enum(['admin', 'manager', 'user']).optional(),
  isActive: z.boolean().optional(),
});

const userFiltersSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
  search: z.string().optional(),
  role: z.enum(['admin', 'manager', 'user']).optional(),
  isActive: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
});

export class UserController {
  // Get all users (admin only)
  getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const filters = userFiltersSchema.parse(req.query);
      const { page, limit, search, role, isActive } = filters;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = isActive;

      // Get users with pagination
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
            emailVerified: true,
            phoneVerified: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      res.json(ApiResponseUtil.success({
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      }));
    } catch (error) {
      console.error('[User] Error getting users:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json(ApiResponseUtil.validationError(error.errors));
        return;
      }
      res.status(500).json(ApiResponseUtil.error('Failed to get users'));
    }
  };

  // Get user by ID
  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        res.status(404).json(ApiResponseUtil.error('User not found', 404));
        return;
      }

      res.json(ApiResponseUtil.success({ user }));
    } catch (error) {
      console.error('[User] Error getting user:', error);
      res.status(500).json(ApiResponseUtil.error('Failed to get user'));
    }
  };

  // Create user (admin only)
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedData = createUserSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });

      if (existingUser) {
        res.status(400).json(ApiResponseUtil.error('User with this email already exists'));
        return;
      }

      // Hash password
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(validatedData.password, 12);

      const user = await prisma.user.create({
        data: {
          ...validatedData,
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.status(201).json(ApiResponseUtil.success({ user }, 'User created successfully'));
    } catch (error) {
      console.error('[User] Error creating user:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json(ApiResponseUtil.validationError(error.errors));
        return;
      }
      res.status(500).json(ApiResponseUtil.error('Failed to create user'));
    }
  };

  // Update user
  updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const validatedData = updateUserSchema.parse(req.body);

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        res.status(404).json(ApiResponseUtil.error('User not found', 404));
        return;
      }

      // Check if email is being changed and if it's already taken
      if (validatedData.email && validatedData.email !== existingUser.email) {
        const emailExists = await prisma.user.findUnique({
          where: { email: validatedData.email },
        });

        if (emailExists) {
          res.status(400).json(ApiResponseUtil.error('Email already taken'));
          return;
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: validatedData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.json(ApiResponseUtil.success({ user }, 'User updated successfully'));
    } catch (error) {
      console.error('[User] Error updating user:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json(ApiResponseUtil.validationError(error.errors));
        return;
      }
      res.status(500).json(ApiResponseUtil.error('Failed to update user'));
    }
  };

  // Delete user (admin only)
  deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        res.status(404).json(ApiResponseUtil.error('User not found', 404));
        return;
      }

      // Soft delete by setting isActive to false
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      res.json(ApiResponseUtil.success(null, 'User deactivated successfully'));
    } catch (error) {
      console.error('[User] Error deleting user:', error);
      res.status(500).json(ApiResponseUtil.error('Failed to delete user'));
    }
  };

  // Get user profile
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json(ApiResponseUtil.error('Authentication required', 401));
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        res.status(404).json(ApiResponseUtil.error('User not found', 404));
        return;
      }

      res.json(ApiResponseUtil.success({ user }));
    } catch (error) {
      console.error('[User] Error getting profile:', error);
      res.status(500).json(ApiResponseUtil.error('Failed to get profile'));
    }
  };

  // Update user profile
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const validatedData = updateUserSchema.parse(req.body);

      if (!userId) {
        res.status(401).json(ApiResponseUtil.error('Authentication required', 401));
        return;
      }

      // Remove role from update data (users can't change their own role)
      const { role, ...updateData } = validatedData;

      // Check if email is being changed and if it's already taken
      if (updateData.email) {
        const existingUser = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (updateData.email !== existingUser?.email) {
          const emailExists = await prisma.user.findUnique({
            where: { email: updateData.email },
          });

          if (emailExists) {
            res.status(400).json(ApiResponseUtil.error('Email already taken'));
            return;
          }
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.json(ApiResponseUtil.success({ user }, 'Profile updated successfully'));
    } catch (error) {
      console.error('[User] Error updating profile:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json(ApiResponseUtil.validationError(error.errors));
        return;
      }
      res.status(500).json(ApiResponseUtil.error('Failed to update profile'));
    }
  };
}
