// Dev helper: print the current contents of the key collections, so you can
// verify what the bot persisted. Read-only.
//
// Usage:  node scripts/inspect-db.mjs
import 'dotenv/config';
import mongoose from 'mongoose';

import { Shop } from '../src/models/Shop.js';
import { Session } from '../src/models/Session.js';
import { Product } from '../src/models/Product.js';
import { Transaction } from '../src/models/Transaction.js';
import { Customer } from '../src/models/Customer.js';
import { Kasbon } from '../src/models/Kasbon.js';

const uri = process.env.MONGODB_URI;
await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });

const collections = [
  ['Shops', Shop],
  ['Sessions', Session],
  ['Products', Product],
  ['Transactions', Transaction],
  ['Customers', Customer],
  ['Kasbons', Kasbon],
];

for (const [label, Model] of collections) {
  const count = await Model.countDocuments();
  console.log(`\n=== ${label} (${count}) ===`);
  if (count > 0) {
    console.dir(await Model.find().limit(10).lean(), { depth: 4 });
  }
}

await mongoose.disconnect();
