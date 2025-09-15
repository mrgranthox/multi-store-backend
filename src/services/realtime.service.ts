import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { AuthService } from './auth.service';

// Types
export interface SocketUser {
  userId: string;
  email: string;
  socketId: string;
  connectedAt: Date;
}

export interface RealtimeMessage {
  type: 'order_status_update' | 'inventory_update' | 'promotion_new' | 'notification';
  data: any;
  timestamp: Date;
}

export interface OrderStatusUpdate {
  orderId: string;
  orderNumber: string;
  status: string;
  estimatedPickupTime?: string;
  actualPickupTime?: string;
  message?: string;
}

export interface InventoryUpdate {
  storeId: string;
  productId: string;
  quantityAvailable: number;
  reservedQuantity: number;
  isAvailable: boolean;
}

export interface PromotionNotification {
  promotionId: string;
  title: string;
  description: string;
  discountType: string;
  discountValue: number;
  validUntil: string;
}

// Service class
export class RealtimeService {
  private io: SocketIOServer;
  private authService: AuthService;
  private connectedUsers: Map<string, SocketUser> = new Map();
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(httpServer: HTTPServer) {
    this.authService = new AuthService();

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  // Setup authentication middleware
  private setupMiddleware(): void {
    this.io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth.token ||
          socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = this.authService.verifyAccessToken(token);
        if (!decoded) {
          return next(new Error('Invalid authentication token'));
        }

        // Add user info to socket
        (socket as any).user = decoded;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  }

  // Setup event handlers
  private setupEventHandlers(): void {
    this.io.on('connection', socket => {
      const user = (socket as any).user;
      const userId = user.userId;
      const email = user.email;

      console.log(`[Realtime] User ${email} connected with socket ${socket.id}`);

      // Store user connection
      this.connectedUsers.set(socket.id, {
        userId,
        email,
        socketId: socket.id,
        connectedAt: new Date(),
      });

      // Track user sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // Join user-specific channels
      socket.join(`user_orders_${userId}`);
      socket.join(`notifications_${userId}`);

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`[Realtime] User ${email} disconnected`);

        this.connectedUsers.delete(socket.id);
        this.userSockets.get(userId)?.delete(socket.id);

        if (this.userSockets.get(userId)?.size === 0) {
          this.userSockets.delete(userId);
        }
      });

      // Handle join store channel (for store managers)
      socket.on('join_store', (storeId: string) => {
        socket.join(`store_orders_${storeId}`);
        socket.join(`inventory_store_${storeId}`);
        console.log(`[Realtime] User ${email} joined store ${storeId} channels`);
      });

      // Handle leave store channel
      socket.on('leave_store', (storeId: string) => {
        socket.leave(`store_orders_${storeId}`);
        socket.leave(`inventory_store_${storeId}`);
        console.log(`[Realtime] User ${email} left store ${storeId} channels`);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });
    });
  }

  // Send order status update to user
  sendOrderStatusUpdate(userId: string, update: OrderStatusUpdate): void {
    const message: RealtimeMessage = {
      type: 'order_status_update',
      data: update,
      timestamp: new Date(),
    };

    this.io.to(`user_orders_${userId}`).emit('order_status_update', message);
    console.log(`[Realtime] Sent order status update to user ${userId}: ${update.status}`);
  }

  // Send order update to store
  sendOrderUpdateToStore(storeId: string, update: OrderStatusUpdate): void {
    const message: RealtimeMessage = {
      type: 'order_status_update',
      data: update,
      timestamp: new Date(),
    };

    this.io.to(`store_orders_${storeId}`).emit('order_status_update', message);
    console.log(`[Realtime] Sent order update to store ${storeId}: ${update.status}`);
  }

  // Send inventory update to store
  sendInventoryUpdate(storeId: string, update: InventoryUpdate): void {
    const message: RealtimeMessage = {
      type: 'inventory_update',
      data: update,
      timestamp: new Date(),
    };

    this.io.to(`inventory_store_${storeId}`).emit('inventory_update', message);
    console.log(`[Realtime] Sent inventory update to store ${storeId}: ${update.productId}`);
  }

  // Send promotion notification to user
  sendPromotionNotification(userId: string, promotion: PromotionNotification): void {
    const message: RealtimeMessage = {
      type: 'promotion_new',
      data: promotion,
      timestamp: new Date(),
    };

    this.io.to(`notifications_${userId}`).emit('promotion_new', message);
    console.log(`[Realtime] Sent promotion notification to user ${userId}: ${promotion.title}`);
  }

  // Send general notification to user
  sendNotification(
    userId: string,
    notification: {
      title: string;
      message: string;
      type: 'info' | 'success' | 'warning' | 'error';
      data?: any;
    }
  ): void {
    const message: RealtimeMessage = {
      type: 'notification',
      data: notification,
      timestamp: new Date(),
    };

    this.io.to(`notifications_${userId}`).emit('notification', message);
    console.log(`[Realtime] Sent notification to user ${userId}: ${notification.title}`);
  }

  // Broadcast to all connected users
  broadcast(message: RealtimeMessage): void {
    this.io.emit('broadcast', message);
    console.log(`[Realtime] Broadcasted message: ${message.type}`);
  }

  // Send to specific users
  sendToUsers(userIds: string[], message: RealtimeMessage): void {
    userIds.forEach(userId => {
      this.io.to(`notifications_${userId}`).emit('notification', message);
    });
    console.log(`[Realtime] Sent message to ${userIds.length} users: ${message.type}`);
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Get connected users by store
  getConnectedUsersByStore(storeId: string): SocketUser[] {
    const users: SocketUser[] = [];

    for (const [socketId, user] of this.connectedUsers) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket && socket.rooms.has(`store_orders_${storeId}`)) {
        users.push(user);
      }
    }

    return users;
  }

  // Get user connection info
  getUserConnections(userId: string): SocketUser[] {
    const connections: SocketUser[] = [];

    for (const socketId of this.userSockets.get(userId) || []) {
      const user = this.connectedUsers.get(socketId);
      if (user) {
        connections.push(user);
      }
    }

    return connections;
  }

  // Check if user is connected
  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  // Disconnect user
  disconnectUser(userId: string): void {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      for (const socketId of socketIds) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
    }
  }

  // Get server statistics
  getStats(): {
    connectedUsers: number;
    totalSockets: number;
    rooms: number;
    uptime: number;
  } {
    return {
      connectedUsers: this.userSockets.size,
      totalSockets: this.connectedUsers.size,
      rooms: this.io.sockets.adapter.rooms.size,
      uptime: process.uptime(),
    };
  }

  // Health check
  healthCheck(): {
    status: 'healthy' | 'unhealthy';
    connectedUsers: number;
    uptime: number;
  } {
    return {
      status: 'healthy',
      connectedUsers: this.connectedUsers.size,
      uptime: process.uptime(),
    };
  }
}
