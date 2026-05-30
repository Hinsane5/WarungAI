// Dev helper: initialize the local MongoDB as a single-node replica set ("rs0").
// Run ONCE after starting mongod with --replSet (i.e. `npm run db:start`).
// A single-node replica set is what unlocks MongoDB multi-document transactions,
// which Phase 3's atomic stock+cash commit relies on. Idempotent — safe to re-run.
//
// Usage:  npm run db:init   (or: node scripts/init-replset.mjs)
import mongoose from 'mongoose';

const host = process.env.MONGO_HOST ?? '127.0.0.1:27017';
const conn = await mongoose
  .createConnection(`mongodb://${host}/?directConnection=true`, { serverSelectionTimeoutMS: 4000 })
  .asPromise();

try {
  await conn.db.admin().command({
    replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host }] },
  });
  console.log(`✓ Replica set "rs0" initiated on ${host}. Transactions are now available.`);
} catch (error) {
  if (error.codeName === 'AlreadyInitialized') {
    console.log('✓ Replica set already initialized — nothing to do.');
  } else {
    console.error(`✗ Could not initialize replica set: ${error.codeName ?? error.message}`);
    console.error('  Make sure mongod is running via `npm run db:start` (it must use --replSet).');
    process.exitCode = 1;
  }
} finally {
  await conn.close();
}
