// Dev helper: run the nightly batch jobs once against the current database, then exit.
// Proves the jobs are directly callable (the Cloud Scheduler / HTTP-trigger contract).
//
// Usage:  node scripts/run-jobs.mjs            (runs all three)
//         node scripts/run-jobs.mjs restock    (just predictive restock)
//         node scripts/run-jobs.mjs credit     (just credit score refresh)
//         node scripts/run-jobs.mjs crm        (just CRM notifier)
import 'dotenv/config';
import mongoose from 'mongoose';

import {
  runCreditScoreRefresh,
  runCrmNotifier,
  runNightlyJobs,
  runPredictiveRestock,
} from '../src/jobs/index.js';

const which = process.argv[2] ?? 'all';
const runners = {
  restock: runPredictiveRestock,
  credit: runCreditScoreRefresh,
  crm: runCrmNotifier,
  all: runNightlyJobs,
};

const runner = runners[which];
if (!runner) {
  console.error(`Unknown job "${which}". Use: restock | credit | crm | all`);
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
try {
  const result = await runner({ now: new Date() });
  console.log(`\n✓ Job "${which}" finished:`);
  console.dir(result, { depth: 4 });
} finally {
  await mongoose.disconnect();
}
