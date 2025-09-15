import { z } from 'zod';

// Validation schemas
export const processPaymentSchema = z.object({
  amount: z.number().min(0.01),
  paymentMethod: z.string().min(1),
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const processRefundSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().min(0.01),
  reason: z.string().optional(),
});

// Types
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  error?: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
}

// Service class
export class PaymentService {
  private readonly paymentProviderKey: string;
  private readonly isTestMode: boolean;

  constructor() {
    this.paymentProviderKey = process.env.PAYMENT_PROVIDER_KEY || 'test_key';
    this.isTestMode = process.env.NODE_ENV !== 'production';
  }

  // Process payment
  async processPayment(data: z.infer<typeof processPaymentSchema>): Promise<PaymentResult> {
    const { amount, paymentMethod, orderId, userId } = data;

    try {
      // In a real implementation, this would integrate with actual payment providers
      // For now, we'll simulate payment processing
      const result = await this.simulatePayment({
        amount,
        paymentMethod,
        orderId,
        userId,
      });

      console.log(
        `[Payment] Processed payment for order ${orderId}: ${result.success ? 'SUCCESS' : 'FAILED'}`
      );

      return result;
    } catch (error) {
      console.error('[Payment] Payment processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment processing failed',
        amount,
        currency: 'USD',
        status: 'failed',
      };
    }
  }

  // Process refund
  async processRefund(data: z.infer<typeof processRefundSchema>): Promise<RefundResult> {
    const { orderId, amount, reason } = data;

    try {
      // In a real implementation, this would integrate with actual payment providers
      // For now, we'll simulate refund processing
      const result = await this.simulateRefund({
        orderId,
        amount,
        reason,
      });

      console.log(
        `[Payment] Processed refund for order ${orderId}: ${result.success ? 'SUCCESS' : 'FAILED'}`
      );

      return result;
    } catch (error) {
      console.error('[Payment] Refund processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund processing failed',
        amount,
        status: 'failed',
      };
    }
  }

  // Simulate payment processing (for development/testing)
  private async simulatePayment(params: {
    amount: number;
    paymentMethod: string;
    orderId: string;
    userId: string;
  }): Promise<PaymentResult> {
    const { amount, paymentMethod } = params;

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Simulate different payment method behaviors
    let success = true;
    let error: string | undefined;

    switch (paymentMethod.toLowerCase()) {
      case 'credit_card':
        // 95% success rate for credit cards
        success = Math.random() > 0.05;
        if (!success) {
          error = 'Card declined';
        }
        break;
      case 'debit_card':
        // 90% success rate for debit cards
        success = Math.random() > 0.1;
        if (!success) {
          error = 'Insufficient funds';
        }
        break;
      case 'paypal':
        // 98% success rate for PayPal
        success = Math.random() > 0.02;
        if (!success) {
          error = 'PayPal account error';
        }
        break;
      case 'apple_pay':
        // 99% success rate for Apple Pay
        success = Math.random() > 0.01;
        if (!success) {
          error = 'Apple Pay authentication failed';
        }
        break;
      case 'google_pay':
        // 99% success rate for Google Pay
        success = Math.random() > 0.01;
        if (!success) {
          error = 'Google Pay authentication failed';
        }
        break;
      case 'test_fail':
        // Always fail for testing
        success = false;
        error = 'Test payment failure';
        break;
      default:
        // 85% success rate for other methods
        success = Math.random() > 0.15;
        if (!success) {
          error = 'Payment method not supported';
        }
    }

    // Simulate high-value transaction failures
    if (amount > 1000 && Math.random() > 0.7) {
      success = false;
      error = 'High-value transaction requires additional verification';
    }

    const transactionId = success ? this.generateTransactionId() : undefined;

    return {
      success,
      transactionId,
      error,
      amount,
      currency: 'USD',
      status: success ? 'completed' : 'failed',
    };
  }

  // Simulate refund processing (for development/testing)
  private async simulateRefund(params: {
    orderId: string;
    amount: number;
    reason?: string;
  }): Promise<RefundResult> {
    const { amount } = params;

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    // 98% success rate for refunds
    const success = Math.random() > 0.02;
    const error = success ? undefined : 'Refund processing failed';

    const refundId = success ? this.generateRefundId() : undefined;

    return {
      success,
      refundId,
      error,
      amount,
      status: success ? 'completed' : 'failed',
    };
  }

  // Generate transaction ID
  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `txn_${timestamp}_${random}`.toUpperCase();
  }

  // Generate refund ID
  private generateRefundId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `ref_${timestamp}_${random}`.toUpperCase();
  }

  // Validate payment method
  validatePaymentMethod(paymentMethod: string): boolean {
    const validMethods = [
      'credit_card',
      'debit_card',
      'paypal',
      'apple_pay',
      'google_pay',
      'bank_transfer',
      'cash_on_delivery',
      'test_fail', // For testing purposes
    ];

    return validMethods.includes(paymentMethod.toLowerCase());
  }

  // Get supported payment methods
  getSupportedPaymentMethods(): string[] {
    return [
      'credit_card',
      'debit_card',
      'paypal',
      'apple_pay',
      'google_pay',
      'bank_transfer',
      'cash_on_delivery',
    ];
  }

  // Get payment method display name
  getPaymentMethodDisplayName(paymentMethod: string): string {
    const displayNames: Record<string, string> = {
      credit_card: 'Credit Card',
      debit_card: 'Debit Card',
      paypal: 'PayPal',
      apple_pay: 'Apple Pay',
      google_pay: 'Google Pay',
      bank_transfer: 'Bank Transfer',
      cash_on_delivery: 'Cash on Delivery',
    };

    return displayNames[paymentMethod.toLowerCase()] || paymentMethod;
  }

  // Calculate processing fee
  calculateProcessingFee(amount: number, paymentMethod: string): number {
    const feeRates: Record<string, number> = {
      credit_card: 0.029, // 2.9%
      debit_card: 0.015, // 1.5%
      paypal: 0.034, // 3.4%
      apple_pay: 0.029, // 2.9%
      google_pay: 0.029, // 2.9%
      bank_transfer: 0.005, // 0.5%
      cash_on_delivery: 0, // No fee
    };

    const rate = feeRates[paymentMethod.toLowerCase()] || 0.029;
    const fee = amount * rate;

    // Add fixed fee for small transactions
    const fixedFee = amount < 10 ? 0.3 : 0;

    return Math.round((fee + fixedFee) * 100) / 100;
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    provider: string;
    testMode: boolean;
  }> {
    try {
      // In a real implementation, this would check the actual payment provider
      return {
        status: 'healthy',
        provider: 'simulated',
        testMode: this.isTestMode,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: 'simulated',
        testMode: this.isTestMode,
      };
    }
  }
}
