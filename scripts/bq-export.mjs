// Export committed sales from MongoDB into BigQuery (the regional/B2B warehouse).
// Creates the dataset + table if needed. Auth via ADC (gcloud auth application-default login).
//
// Usage:  npm run bq:export
import 'dotenv/config';
import mongoose from 'mongoose';

import { exportTransactions } from '../src/services/bigqueryService.js';

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
try {
  const result = await exportTransactions({ fullReload: true });
  console.log(`✓ Exported ${result.exported} transaction-item rows to BigQuery.`);
} finally {
  await mongoose.disconnect();
}
