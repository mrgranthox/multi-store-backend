import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../db/prisma';

// Validation schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  profileImage: string | null;
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
}

// Service class
export class AuthService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiresIn: string;
  private readonly refreshTokenExpiresIn: string;

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET!;
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET!;
    this.accessTokenExpiresIn = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
    this.refreshTokenExpiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

    if (!this.accessTokenSecret || !this.refreshTokenSecret) {
      throw new Error('JWT secrets are not configured');
    }
  }

  // Hash password
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  // Verify password
  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  // Generate access token
  generateAccessToken(user: AuthUser): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        type: 'access',
      },
      this.accessTokenSecret,
      { expiresIn: this.accessTokenExpiresIn } as jwt.SignOptions
    );
  }

  // Generate refresh token
  generateRefreshToken(userId: string): string {
    return jwt.sign(
      {
        userId,
        type: 'refresh',
      },
      this.refreshTokenSecret,
      { expiresIn: this.refreshTokenExpiresIn } as jwt.SignOptions
    );
  }

  // Verify access token
  verifyAccessToken(token: string): { userId: string; email: string } | null {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret) as any;
      if (decoded.type !== 'access') return null;
      return { userId: decoded.userId, email: decoded.email };
    } catch {
      return null;
    }
  }

  // Verify refresh token
  verifyRefreshToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret) as any;
      if (decoded.type !== 'refresh') return null;
      return { userId: decoded.userId };
    } catch {
      return null;
    }
  }

  // Register new user
  async register(
    userData: z.infer<typeof registerSchema>
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const { email, password, firstName, lastName, phone } = userData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Check if phone is already taken
    if (phone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone },
      });

      if (existingPhone) {
        throw new Error('User with this phone number already exists');
      }
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
      },
    });

    // Generate tokens
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      profileImage: user.profileImage,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };

    const tokens = await this.generateTokens(authUser);

    return { user: authUser, tokens };
  }

  // Login user
  async login(
    email: string,
    password: string,
    deviceInfo?: {
      deviceType?: string;
      deviceId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Create auth user object
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      profileImage: user.profileImage,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };

    // Generate tokens
    const tokens = await this.generateTokens(authUser, deviceInfo);

    return { user: authUser, tokens };
  }

  // Refresh tokens
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const decoded = this.verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new Error('Invalid refresh token');
    }

    // Find user session
    const session = await prisma.userSession.findFirst({
      where: {
        sessionToken: refreshToken,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      throw new Error('Invalid or expired refresh token');
    }

    // Create auth user object
    const authUser: AuthUser = {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      phone: session.user.phone,
      profileImage: session.user.profileImage,
      isActive: session.user.isActive,
      emailVerified: session.user.emailVerified,
      phoneVerified: session.user.phoneVerified,
    };

    // Generate new tokens
    const tokens = await this.generateTokens(authUser);

    // Invalidate old session
    await prisma.userSession.update({
      where: { id: session.id },
      data: { isActive: false },
    });

    return tokens;
  }

  // Logout user
  async logout(refreshToken: string): Promise<void> {
    const session = await prisma.userSession.findFirst({
      where: {
        sessionToken: refreshToken,
        isActive: true,
      },
    });

    if (session) {
      await prisma.userSession.update({
        where: { id: session.id },
        data: { isActive: false },
      });
    }
  }

  // Generate tokens and create session
  private async generateTokens(
    user: AuthUser,
    deviceInfo?: {
      deviceType?: string;
      deviceId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuthTokens> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user.id);

    // Calculate expiration date for refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    // Create session
    await prisma.userSession.create({
      data: {
        userId: user.id,
        sessionToken: refreshToken,
        deviceType: deviceInfo?.deviceType,
        deviceId: deviceInfo?.deviceId,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  // Get user by ID
  async getUserById(userId: string): Promise<AuthUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      profileImage: user.profileImage,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };
  }

  // Update user profile
  async updateProfile(
    userId: string,
    updateData: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      profileImage?: string;
    }
  ): Promise<AuthUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      profileImage: user.profileImage,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };
  }
}
