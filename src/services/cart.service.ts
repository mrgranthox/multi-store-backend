import { z } from 'zod';
import prisma from '../db/prisma';
import { StrapiService } from './strapi.service';
import { ShoppingCart, CartItem } from '@prisma/client';

// Validation schemas
export const addToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().min(1).max(100),
  storeId: z.string().uuid(),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().min(1).max(100),
});

export const promoCodeSchema = z.object({
  code: z.string().min(1),
});

// Types
export interface CartWithItems extends ShoppingCart {
  items: (CartItem & {
    product?: any; // Strapi product data
  })[];
  totals: {
    subtotal: number;
    tax: number;
    deliveryFee: number;
    discount: number;
    total: number;
  };
}

export interface CartSummary {
  itemCount: number;
  uniqueProducts: number;
  subtotal: number;
  estimatedTax: number;
  estimatedDeliveryFee: number;
  estimatedTotal: number;
}

// Service class
export class CartService {
  private strapiService: StrapiService;

  constructor() {
    this.strapiService = new StrapiService();
  }

  // Get or create cart for user and store
  async getOrCreateCart(userId: string, storeId: string): Promise<ShoppingCart> {
    let cart = await prisma.shoppingCart.findFirst({
      where: {
        userId,
        storeId,
        isActive: true,
      },
    });

    if (!cart) {
      cart = await prisma.shoppingCart.create({
        data: {
          userId,
          storeId,
        },
      });
    }

    return cart;
  }

  // Get cart with items and totals
  async getCartWithItems(userId: string, storeId: string): Promise<CartWithItems | null> {
    const cart = await prisma.shoppingCart.findFirst({
      where: {
        userId,
        storeId,
        isActive: true,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!cart) {
      return null;
    }

    // Fetch product data from Strapi for each item
    const itemsWithProducts = await Promise.all(
      cart.items.map(async (item: any) => {
        try {
          // Try to get product from Strapi
          const productResponse = await this.strapiService.getProductById(parseInt(item.productId));
          return {
            ...item,
            product: productResponse.data,
          };
        } catch (error) {
          console.warn(`[Cart] Could not fetch product ${item.productId}:`, error);
          return {
            ...item,
            product: null,
          };
        }
      })
    );

    // Calculate totals
    const totals = this.calculateCartTotals(itemsWithProducts);

    return {
      ...cart,
      items: itemsWithProducts,
      totals,
    };
  }

  // Add item to cart
  async addToCart(userId: string, data: z.infer<typeof addToCartSchema>): Promise<CartWithItems> {
    const { productId, quantity, storeId } = data;

    // Validate product exists and get current price
    let productPrice: number;
    try {
      const productResponse = await this.strapiService.getProductById(parseInt(productId));
      productPrice = productResponse.data.attributes.price;
    } catch (error) {
      throw new Error('Product not found');
    }

    // Check inventory availability
    const inventory = await prisma.storeInventory.findFirst({
      where: {
        storeId,
        productId,
        isAvailable: true,
      },
    });

    if (!inventory) {
      throw new Error('Product not available in this store');
    }

    if (inventory.quantityAvailable < quantity) {
      throw new Error(`Only ${inventory.quantityAvailable} items available`);
    }

    // Get or create cart
    const cart = await this.getOrCreateCart(userId, storeId);

    // Check if item already exists in cart
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
      },
    });

    if (existingItem) {
      // Update existing item
      const newQuantity = existingItem.quantity + quantity;

      if (inventory.quantityAvailable < newQuantity) {
        throw new Error(
          `Only ${inventory.quantityAvailable} items available (${existingItem.quantity} already in cart)`
        );
      }

      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          priceAtTime: productPrice,
        },
      });
    } else {
      // Create new item
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          quantity,
          priceAtTime: productPrice,
        },
      });
    }

    // Return updated cart
    return this.getCartWithItems(userId, storeId) as Promise<CartWithItems>;
  }

  // Update cart item quantity
  async updateCartItem(
    userId: string,
    itemId: string,
    data: z.infer<typeof updateCartItemSchema>
  ): Promise<CartWithItems> {
    const { quantity } = data;

    // Find the cart item
    const cartItem = await prisma.cartItem.findFirst({
      where: { id: itemId },
      include: {
        cart: true,
      },
    });

    if (!cartItem) {
      throw new Error('Cart item not found');
    }

    if (cartItem.cart.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Check inventory availability
    const inventory = await prisma.storeInventory.findFirst({
      where: {
        storeId: cartItem.cart.storeId,
        productId: cartItem.productId,
        isAvailable: true,
      },
    });

    if (!inventory) {
      throw new Error('Product no longer available');
    }

    if (inventory.quantityAvailable < quantity) {
      throw new Error(`Only ${inventory.quantityAvailable} items available`);
    }

    // Update the item
    await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    // Return updated cart
    return this.getCartWithItems(userId, cartItem.cart.storeId) as Promise<CartWithItems>;
  }

  // Remove item from cart
  async removeCartItem(userId: string, itemId: string): Promise<CartWithItems> {
    // Find the cart item
    const cartItem = await prisma.cartItem.findFirst({
      where: { id: itemId },
      include: {
        cart: true,
      },
    });

    if (!cartItem) {
      throw new Error('Cart item not found');
    }

    if (cartItem.cart.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Delete the item
    await prisma.cartItem.delete({
      where: { id: itemId },
    });

    // Return updated cart
    return this.getCartWithItems(userId, cartItem.cart.storeId) as Promise<CartWithItems>;
  }

  // Clear cart
  async clearCart(userId: string, storeId: string): Promise<void> {
    const cart = await prisma.shoppingCart.findFirst({
      where: {
        userId,
        storeId,
        isActive: true,
      },
    });

    if (cart) {
      // Delete all cart items
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }
  }

  // Apply promo code
  async applyPromoCode(
    userId: string,
    storeId: string,
    data: z.infer<typeof promoCodeSchema>
  ): Promise<{
    valid: boolean;
    discount: number;
    message: string;
  }> {
    const { code } = data;

    try {
      // Get active promotions from Strapi
      const promotions = await this.strapiService.getPromotions({
        filters: {
          code: code,
          isActive: true,
        },
      });

      if (promotions.data.length === 0) {
        return {
          valid: false,
          discount: 0,
          message: 'Invalid promo code',
        };
      }

      const promotion = promotions.data[0];
      const now = new Date();
      const startDate = new Date(promotion.attributes.startDate);
      const endDate = new Date(promotion.attributes.endDate);

      // Check if promotion is active
      if (now < startDate || now > endDate) {
        return {
          valid: false,
          discount: 0,
          message: 'Promo code has expired',
        };
      }

      // Get cart to calculate discount
      const cart = await this.getCartWithItems(userId, storeId);
      if (!cart) {
        return {
          valid: false,
          discount: 0,
          message: 'Cart is empty',
        };
      }

      // Check minimum order amount
      if (
        promotion.attributes.minOrderAmount &&
        cart.totals.subtotal < promotion.attributes.minOrderAmount
      ) {
        return {
          valid: false,
          discount: 0,
          message: `Minimum order amount of $${promotion.attributes.minOrderAmount} required`,
        };
      }

      // Calculate discount
      let discount = 0;
      if (promotion.attributes.discountType === 'percentage') {
        discount = (cart.totals.subtotal * promotion.attributes.discountValue) / 100;
      } else {
        discount = promotion.attributes.discountValue;
      }

      // Apply maximum discount limit
      if (
        promotion.attributes.maxDiscountAmount &&
        discount > promotion.attributes.maxDiscountAmount
      ) {
        discount = promotion.attributes.maxDiscountAmount;
      }

      return {
        valid: true,
        discount: Math.round(discount * 100) / 100,
        message: `Promo code applied! You saved $${discount.toFixed(2)}`,
      };
    } catch (error) {
      console.error('[Cart] Error applying promo code:', error);
      return {
        valid: false,
        discount: 0,
        message: 'Error applying promo code',
      };
    }
  }

  // Calculate cart totals
  private calculateCartTotals(
    items: (CartItem & { product?: any })[]
  ): {
    subtotal: number;
    tax: number;
    deliveryFee: number;
    discount: number;
    total: number;
  } {
    const subtotal = items.reduce((sum, item) => {
      return sum + Number(item.priceAtTime) * item.quantity;
    }, 0);

    // Calculate tax (simplified - 8.5% for now)
    const taxRate = 0.085;
    const tax = subtotal * taxRate;

    // Calculate delivery fee (simplified - $2.99 for orders under $25)
    const deliveryFee = subtotal < 25 ? 2.99 : 0;

    // No discount applied yet (would be calculated separately)
    const discount = 0;

    const total = subtotal + tax + deliveryFee - discount;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  // Get cart summary
  async getCartSummary(userId: string, storeId: string): Promise<CartSummary | null> {
    const cart = await this.getCartWithItems(userId, storeId);
    if (!cart) {
      return null;
    }

    return {
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      uniqueProducts: cart.items.length,
      subtotal: cart.totals.subtotal,
      estimatedTax: cart.totals.tax,
      estimatedDeliveryFee: cart.totals.deliveryFee,
      estimatedTotal: cart.totals.total,
    };
  }

  // Validate cart before checkout
  async validateCartForCheckout(
    userId: string,
    storeId: string
  ): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    const cart = await this.getCartWithItems(userId, storeId);

    if (!cart || cart.items.length === 0) {
      errors.push('Cart is empty');
      return { valid: false, errors };
    }

    // Check each item for availability
    for (const item of cart.items) {
      const inventory = await prisma.storeInventory.findFirst({
        where: {
          storeId,
          productId: item.productId,
        },
      });

      if (!inventory) {
        errors.push(`Product ${item.productId} is no longer available`);
      } else if (!inventory.isAvailable) {
        errors.push(`Product ${item.productId} is currently unavailable`);
      } else if (inventory.quantityAvailable < item.quantity) {
        errors.push(
          `Only ${inventory.quantityAvailable} of ${item.productId} available (${item.quantity} in cart)`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
