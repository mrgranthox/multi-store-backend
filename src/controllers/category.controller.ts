import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponseUtil } from '../utils/api-response';
import prisma from '../db/prisma';
import { StrapiService } from '../services/strapi.service';

const strapiService = new StrapiService();

export class CategoryController {
  async getCategories(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, search } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where = search ? {
        name: {
          contains: search as string,
          mode: 'insensitive'
        }
      } : {};

      const [categories, total] = await Promise.all([
        prisma.category.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { name: 'asc' }
        }),
        prisma.category.count({ where })
      ]);

      return ApiResponseUtil.success(res, {
        data: categories,
        meta: {
          pagination: {
            page: Number(page),
            pageSize: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit))
          }
        }
      }, 'Categories retrieved successfully');
    } catch (error) {
      console.error('Error getting categories:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve categories');
    }
  }

  async getCategoryById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          products: {
            take: 10,
            orderBy: { name: 'asc' }
          }
        }
      });

      if (!category) {
        return ApiResponseUtil.notFound(res, 'Category not found');
      }

      return ApiResponseUtil.success(res, category, 'Category retrieved successfully');
    } catch (error) {
      console.error('Error getting category:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve category');
    }
  }

  async createCategory(req: Request, res: Response) {
    try {
      const { name, description, image, isActive = true } = req.body;

      if (!name) {
        return ApiResponseUtil.validationError(res, 'Name is required');
      }

      const category = await prisma.category.create({
        data: {
          name,
          description,
          image,
          isActive
        }
      });

      return ApiResponseUtil.created(res, category, 'Category created successfully');
    } catch (error) {
      console.error('Error creating category:', error);
      return ApiResponseUtil.internalError(res, 'Failed to create category');
    }
  }

  async updateCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, image, isActive } = req.body;

      const existingCategory = await prisma.category.findUnique({
        where: { id }
      });

      if (!existingCategory) {
        return ApiResponseUtil.notFound(res, 'Category not found');
      }

      const category = await prisma.category.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(image !== undefined && { image }),
          ...(isActive !== undefined && { isActive })
        }
      });

      return ApiResponseUtil.success(res, category, 'Category updated successfully');
    } catch (error) {
      console.error('Error updating category:', error);
      return ApiResponseUtil.internalError(res, 'Failed to update category');
    }
  }

  async deleteCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existingCategory = await prisma.category.findUnique({
        where: { id }
      });

      if (!existingCategory) {
        return ApiResponseUtil.notFound(res, 'Category not found');
      }

      // Check if category has products
      const productCount = await prisma.product.count({
        where: { categoryId: id }
      });

      if (productCount > 0) {
        return ApiResponseUtil.badRequest(res, 'Cannot delete category with products');
      }

      await prisma.category.delete({
        where: { id }
      });

      return ApiResponseUtil.success(res, null, 'Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      return ApiResponseUtil.internalError(res, 'Failed to delete category');
    }
  }
}
