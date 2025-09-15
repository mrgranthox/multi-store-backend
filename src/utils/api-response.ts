import { Response } from 'express';
import { z } from 'zod';

// Standard API response interface
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
    timestamp: string;
    requestId: string;
    version?: string;
  };
}

// Pagination metadata interface
export interface PaginationMeta {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

// Response utility class
export class ApiResponseUtil {
  // Success responses
  static success<T>(
    res: Response,
    data: T,
    message: string = 'Success',
    statusCode: number = 200,
    meta?: Partial<ApiResponse<T>['meta']>
  ): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.getHeader('X-Request-ID') as string || 'unknown',
        version: process.env.npm_package_version || '1.0.0',
        ...meta,
      },
    };

    res.status(statusCode).json(response);
  }

  // Error responses
  static error(
    res: Response,
    message: string = 'An error occurred',
    statusCode: number = 500,
    errors?: Record<string, string[]>
  ): void {
    const response: ApiResponse = {
      success: false,
      message,
      errors,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.getHeader('X-Request-ID') as string || 'unknown',
        version: process.env.npm_package_version || '1.0.0',
      },
    };

    res.status(statusCode).json(response);
  }

  // Validation error response
  static validationError(
    res: Response,
    zodError: z.ZodError,
    message: string = 'Validation failed'
  ): void {
    const errors: Record<string, string[]> = {};
    
    zodError.errors.forEach((error) => {
      const field = error.path.join('.');
      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(error.message);
    });

    this.error(res, message, 400, errors);
  }

  // Paginated response
  static paginated<T>(
    res: Response,
    data: T[],
    pagination: PaginationMeta,
    message: string = 'Data retrieved successfully'
  ): void {
    this.success(res, data, message, 200, { pagination });
  }

  // Created response
  static created<T>(
    res: Response,
    data: T,
    message: string = 'Resource created successfully'
  ): void {
    this.success(res, data, message, 201);
  }

  // Updated response
  static updated<T>(
    res: Response,
    data: T,
    message: string = 'Resource updated successfully'
  ): void {
    this.success(res, data, message, 200);
  }

  // Deleted response
  static deleted(
    res: Response,
    message: string = 'Resource deleted successfully'
  ): void {
    this.success(res, null, message, 200);
  }

  // Not found response
  static notFound(
    res: Response,
    message: string = 'Resource not found'
  ): void {
    this.error(res, message, 404);
  }

  // Unauthorized response
  static unauthorized(
    res: Response,
    message: string = 'Unauthorized access'
  ): void {
    this.error(res, message, 401);
  }

  // Forbidden response
  static forbidden(
    res: Response,
    message: string = 'Access forbidden'
  ): void {
    this.error(res, message, 403);
  }

  // Conflict response
  static conflict(
    res: Response,
    message: string = 'Resource conflict'
  ): void {
    this.error(res, message, 409);
  }

  // Too many requests response
  static tooManyRequests(
    res: Response,
    message: string = 'Too many requests',
    retryAfter?: number
  ): void {
    if (retryAfter) {
      res.set('Retry-After', retryAfter.toString());
    }
    this.error(res, message, 429);
  }

  // Internal server error response
  static internalError(
    res: Response,
    message: string = 'Internal server error',
    error?: any
  ): void {
    if (process.env.NODE_ENV === 'development' && error) {
      console.error('Internal error:', error);
    }
    this.error(res, message, 500);
  }

  // Service unavailable response
  static serviceUnavailable(
    res: Response,
    message: string = 'Service temporarily unavailable'
  ): void {
    this.error(res, message, 503);
  }

  // Bad request response
  static badRequest(
    res: Response,
    message: string = 'Bad request',
    errors?: Record<string, string[]>
  ): void {
    this.error(res, message, 400, errors);
  }

  // Method not allowed response
  static methodNotAllowed(
    res: Response,
    message: string = 'Method not allowed'
  ): void {
    this.error(res, message, 405);
  }

  // Request entity too large response
  static entityTooLarge(
    res: Response,
    message: string = 'Request entity too large'
  ): void {
    this.error(res, message, 413);
  }

  // Unsupported media type response
  static unsupportedMediaType(
    res: Response,
    message: string = 'Unsupported media type'
  ): void {
    this.error(res, message, 415);
  }
}

// Validation schemas for common request patterns
export const CommonSchemas = {
  // Pagination schema
  pagination: z.object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(10),
  }),

  // ID parameter schema
  idParam: z.object({
    id: z.string().uuid('Invalid ID format'),
  }),

  // Search query schema
  searchQuery: z.object({
    q: z.string().min(1).max(100),
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(10),
  }),

  // Date range schema
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};

// Request ID middleware
export const addRequestId = (req: any, res: Response, next: any) => {
  req.id = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.set('X-Request-ID', req.id);
  next();
};
