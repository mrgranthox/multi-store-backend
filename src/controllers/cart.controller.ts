import { Request, Response } from 'express';
import { z } from 'zod';
import {
  CartService,
  addToCartSchema,
  updateCartItemSchema,
  promoCodeSchema,
} from '../services/cart.service';

export class CartController {
  private cartService: CartService;

  constructor() {
    this.cartService = new CartService();
  }

  // Get cart
  getCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { storeId } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!storeId || typeof storeId !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      const cart = await this.cartService.getCartWithItems(userId, storeId);

      if (!cart) {
        res.json({
          success: true,
          data: {
            cart: null,
            message: 'Cart is empty',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: { cart },
      });
    } catch (error) {
      console.error('[Cart] Error getting cart:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Add item to cart
  addToCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Validate request body
      const validatedData = addToCartSchema.parse(req.body);

      const cart = await this.cartService.addToCart(userId, validatedData);

      res.json({
        success: true,
        message: 'Item added to cart successfully',
        data: { cart },
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

      console.error('[Cart] Error adding to cart:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Update cart item
  updateCartItem = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { itemId } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!itemId) {
        res.status(400).json({
          success: false,
          message: 'Item ID is required',
        });
        return;
      }

      // Validate request body
      const validatedData = updateCartItemSchema.parse(req.body);

      const cart = await this.cartService.updateCartItem(userId, itemId, validatedData);

      res.json({
        success: true,
        message: 'Cart item updated successfully',
        data: { cart },
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

      console.error('[Cart] Error updating cart item:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Remove cart item
  removeCartItem = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { itemId } = req.params;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!itemId) {
        res.status(400).json({
          success: false,
          message: 'Item ID is required',
        });
        return;
      }

      const cart = await this.cartService.removeCartItem(userId, itemId);

      res.json({
        success: true,
        message: 'Item removed from cart successfully',
        data: { cart },
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      console.error('[Cart] Error removing cart item:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Clear cart
  clearCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { storeId } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!storeId || typeof storeId !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      await this.cartService.clearCart(userId, storeId);

      res.json({
        success: true,
        message: 'Cart cleared successfully',
      });
    } catch (error) {
      console.error('[Cart] Error clearing cart:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Apply promo code
  applyPromoCode = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { storeId } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!storeId || typeof storeId !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      // Validate request body
      const validatedData = promoCodeSchema.parse(req.body);

      const result = await this.cartService.applyPromoCode(userId, storeId, validatedData);

      res.json({
        success: true,
        data: result,
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

      console.error('[Cart] Error applying promo code:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Get cart summary
  getCartSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { storeId } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!storeId || typeof storeId !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      const summary = await this.cartService.getCartSummary(userId, storeId);

      res.json({
        success: true,
        data: { summary },
      });
    } catch (error) {
      console.error('[Cart] Error getting cart summary:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  // Validate cart for checkout
  validateCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { storeId } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!storeId || typeof storeId !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Store ID is required',
        });
        return;
      }

      const validation = await this.cartService.validateCartForCheckout(userId, storeId);

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      console.error('[Cart] Error validating cart:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}
