#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');

// Read the schema file
let schema = fs.readFileSync(schemaPath, 'utf8');

// List of models that need schema annotations
const models = [
  'StoreManager',
  'StoreInventory', 
  'InventoryReservation',
  'ShoppingCart',
  'CartItem',
  'Order',
  'OrderItem',
  'UserAddress',
  'DeviceToken',
  'UserSession',
  'PushNotification',
  'IdempotencyKey'
];

// Add schema annotation to each model
models.forEach(model => {
  const modelRegex = new RegExp(`(model ${model}[\\s\\S]*?)(@@map\\("[^"]+"\\))(\\s*})`, 'g');
  schema = schema.replace(modelRegex, `$1$2\n  @@schema("backend")\n$3`);
});

// Write the updated schema back
fs.writeFileSync(schemaPath, schema);

console.log('✅ Added schema annotations to all models');
