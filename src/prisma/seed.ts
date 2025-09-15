import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@multistore.com' },
    update: {},
    create: {
      email: 'admin@multistore.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      phone: '+1234567890',
      role: 'admin',
      isActive: true,
      emailVerified: true,
      phoneVerified: true,
    },
  });

  // Create manager user
  const managerPassword = await bcrypt.hash('manager123', 12);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@multistore.com' },
    update: {},
    create: {
      email: 'manager@multistore.com',
      password: managerPassword,
      firstName: 'Store',
      lastName: 'Manager',
      phone: '+1234567891',
      role: 'manager',
      isActive: true,
      emailVerified: true,
      phoneVerified: true,
    },
  });

  // Create regular user
  const userPassword = await bcrypt.hash('user123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'user@multistore.com' },
    update: {},
    create: {
      email: 'user@multistore.com',
      password: userPassword,
      firstName: 'Regular',
      lastName: 'User',
      phone: '+1234567892',
      role: 'user',
      isActive: true,
      emailVerified: true,
      phoneVerified: true,
    },
  });

  // Create stores
  const store1 = await prisma.store.upsert({
    where: { id: 'store-1' },
    update: {},
    create: {
      id: 'store-1',
      name: 'Downtown Store',
      description: 'Main downtown location',
      address: '123 Main St',
      city: 'Downtown',
      state: 'CA',
      zipCode: '90210',
      country: 'USA',
      latitude: 34.0522,
      longitude: -118.2437,
      phone: '+1234567893',
      email: 'downtown@multistore.com',
      isActive: true,
      deliveryRadius: 10,
      minOrderAmount: 25.00,
    },
  });

  const store2 = await prisma.store.upsert({
    where: { id: 'store-2' },
    update: {},
    create: {
      id: 'store-2',
      name: 'Mall Store',
      description: 'Shopping mall location',
      address: '456 Mall Ave',
      city: 'Shopping Center',
      state: 'CA',
      zipCode: '90211',
      country: 'USA',
      latitude: 34.0622,
      longitude: -118.2537,
      phone: '+1234567894',
      email: 'mall@multistore.com',
      isActive: true,
      deliveryRadius: 15,
      minOrderAmount: 30.00,
    },
  });

  // Create store manager relationship
  await prisma.storeManager.create({
    data: {
      userId: manager.id,
      storeId: store1.id,
      role: 'manager',
      isActive: true,
    },
  });

  // Create categories
 
 // Corrected category seeding
const category1 = await prisma.category.upsert({
  where: { strapiId: 1 }, // use a unique field
  update: {},
  create: {
    strapiId: 1,
    slug: 'electronics',
    name: 'Electronics',
    description: 'Electronic devices and accessories',
    image: 'https://via.placeholder.com/300x200?text=Electronics',
    isActive: true,
  },
});

const category2 = await prisma.category.upsert({
  where: { strapiId: 2 },
  update: {},
  create: {
    strapiId: 2,
    slug: 'clothing',
    name: 'Clothing',
    description: 'Fashion and apparel',
    image: 'https://via.placeholder.com/300x200?text=Clothing',
    isActive: true,
  },
});

const category3 = await prisma.category.upsert({
  where: { strapiId: 3 },
  update: {},
  create: {
    strapiId: 3,
    slug: 'home-garden',
    name: 'Home & Garden',
    description: 'Home improvement and garden supplies',
    image: 'https://via.placeholder.com/300x200?text=Home+Garden',
    isActive: true,
  },
});

  // Create sample orders
  const order1 = await prisma.order.upsert({
    where: { orderNumber: 'ORD-001' },
    update: {},
    create: {
      orderNumber: 'ORD-001',
      userId: user.id,
      storeId: store1.id,
      status: 'pending',
      totalAmount: 299.99,
      taxAmount: 24.00,
      deliveryFee: 5.99,
      discountAmount: 10.00,
      paymentMethod: 'credit_card',
      paymentStatus: 'pending',
      deliveryType: 'pickup',
      deliveryAddress: '123 User St, User City',
      estimatedPickupTime: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      specialInstructions: 'Please call when ready',
      items: {
        create: [
          {
            productId: 'laptop-001',
            productName: 'Gaming Laptop',
            quantity: 1,
            unitPrice: 299.99,
            totalPrice: 299.99,
            specialInstructions: 'RGB keyboard preferred',
          },
        ],
      },
    },
  });

  const order2 = await prisma.order.upsert({
    where: { orderNumber: 'ORD-002' },
    update: {},
    create: {
      orderNumber: 'ORD-002',
      userId: user.id,
      storeId: store1.id,
      status: 'confirmed',
      totalAmount: 89.99,
      taxAmount: 7.20,
      deliveryFee: 0,
      discountAmount: 0,
      paymentMethod: 'credit_card',
      paymentStatus: 'paid',
      deliveryType: 'delivery',
      deliveryAddress: '123 User St, User City',
      estimatedPickupTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      items: {
        create: [
          {
            productId: 'shirt-001',
            productName: 'Cotton T-Shirt',
            quantity: 2,
            unitPrice: 29.99,
            totalPrice: 59.98,
          },
          {
            productId: 'jeans-001',
            productName: 'Blue Jeans',
            quantity: 1,
            unitPrice: 29.99,
            totalPrice: 29.99,
          },
        ],
      },
    },
  });

  // Create store inventory
  const inventoryData = [
    {
      storeId: store1.id,
      productId: 'laptop-001',
      quantityAvailable: 5,
      reservedQuantity: 1,
      isAvailable: true,
      priceOverride: 299.99,
      lastRestocked: new Date(),
    },
    {
      storeId: store1.id,
      productId: 'shirt-001',
      quantityAvailable: 50,
      reservedQuantity: 2,
      isAvailable: true,
      priceOverride: 29.99,
      lastRestocked: new Date(),
    },
    {
      storeId: store1.id,
      productId: 'jeans-001',
      quantityAvailable: 25,
      reservedQuantity: 1,
      isAvailable: true,
      priceOverride: 29.99,
      lastRestocked: new Date(),
    },
    {
      storeId: store2.id,
      productId: 'laptop-001',
      quantityAvailable: 3,
      reservedQuantity: 0,
      isAvailable: true,
      priceOverride: 299.99,
      lastRestocked: new Date(),
    },
  ];

  for (const item of inventoryData) {
    await prisma.storeInventory.upsert({
      where: {
        storeId_productId: {
          storeId: item.storeId,
          productId: item.productId,
        },
      },
      update: item,
      create: item,
    });
  }

  console.log('✅ Database seeded successfully!');
  console.log('👤 Admin user: admin@multistore.com / admin123');
  console.log('👤 Manager user: manager@multistore.com / manager123');
  console.log('👤 Regular user: user@multistore.com / user123');
  console.log('🏪 Created 2 stores');
  console.log('📦 Created 3 categories');
  console.log('📋 Created 2 sample orders');
  console.log('📊 Created inventory records');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });