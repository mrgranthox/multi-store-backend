import { Request, Response } from 'express';
import { ApiResponseUtil } from '../utils/api-response';

// Mock settings data - in production, this would come from a database
const defaultSettings = {
  appName: 'MultiStore Admin',
  appDescription: 'Admin dashboard for multi-store management',
  appUrl: 'https://admin.multistore.com',
  supportEmail: 'support@multistore.com',
  supportPhone: '+1 (555) 123-4567',
  timezone: 'UTC',
  currency: 'USD',
  language: 'en',
  theme: 'light',
  notifications: {
    email: true,
    push: true,
    sms: false,
  },
  security: {
    twoFactor: false,
    sessionTimeout: 30,
    passwordPolicy: 'medium',
  },
  features: {
    analytics: true,
    reports: true,
    apiAccess: true,
    webhooks: false,
  },
};

export class SettingsController {
  async getSettings(req: Request, res: Response) {
    try {
      return ApiResponseUtil.success(res, defaultSettings, 'Settings retrieved successfully');
    } catch (error) {
      console.error('Error getting settings:', error);
      return ApiResponseUtil.internalError(res, 'Failed to retrieve settings');
    }
  }

  async updateSettings(req: Request, res: Response) {
    try {
      const updatedSettings = { ...defaultSettings, ...req.body };
      
      // In production, save to database here
      // await prisma.settings.update({ data: updatedSettings });
      
      return ApiResponseUtil.success(res, updatedSettings, 'Settings updated successfully');
    } catch (error) {
      console.error('Error updating settings:', error);
      return ApiResponseUtil.internalError(res, 'Failed to update settings');
    }
  }
}
