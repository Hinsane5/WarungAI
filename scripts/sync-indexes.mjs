import 'dotenv/config';
import mongoose from 'mongoose';

import { Product } from '../src/models/Product.js';

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

try {
  const result = await Product.syncIndexes();
  console.log('✓ Product indexes synced');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await mongoose.disconnect();
}
