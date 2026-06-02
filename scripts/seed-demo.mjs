// Seed a realistic demo warung straight into MongoDB — no WhatsApp required.
// Gives the dashboard (Phase 8) real data to render: omzet, kasbon, loyalty,
// 7-day sales trend, category mix, low-stock restock, and credit scores.
//
// Usage:  npm run seed         (wipes the demo shop, then reseeds)
//
// This is the "seed" path from DOCS/MOCK_DATA_AND_DASHBOARD_TESTING.md.
import 'dotenv/config';
import mongoose from 'mongoose';

import { Customer } from '../src/models/Customer.js';
import { Kasbon } from '../src/models/Kasbon.js';
import { Product } from '../src/models/Product.js';
import { Shop } from '../src/models/Shop.js';
import { Transaction } from '../src/models/Transaction.js';
import { refreshCustomerCreditScore } from '../src/services/kasbonService.js';

const SLUG = 'warung-demo';
const DASHBOARD_TOKEN = 'dash_demo_8f6b8e4c3f9d4e19b2a6f0d1';
const now = new Date();
const atDaysAgo = (n, hour = 10) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

// --- wipe any previous demo shop (idempotent) ---
const previous = await Shop.findOne({ loyaltyQrSlug: SLUG });
if (previous) {
  await Promise.all([
    Product.deleteMany({ shopId: previous._id }),
    Customer.deleteMany({ shopId: previous._id }),
    Transaction.deleteMany({ shopId: previous._id }),
    Kasbon.deleteMany({ shopId: previous._id }),
    Shop.deleteOne({ _id: previous._id }),
  ]);
}

// --- shop ---
const shop = await Shop.create({
  name: 'Warung Bu Sri',
  ownerPhone: '+6281200000000',
  ownerName: 'Bu Sri',
  region: 'Tangerang',
  tier: 'premium',
  quotas: { koinBotBalance: 50, dailyTxnCount: 0 },
  loyaltyQrSlug: SLUG,
  dashboardToken: DASHBOARD_TOKEN,
});

// --- catalog (with categories + a couple of low-stock items) ---
const catalog = [
  { name: 'Beras 5kg', category: 'Sembako', unit: 'sak', stock: 30, sellPrice: 65000, costPrice: 58000 },
  { name: 'Minyak Goreng 2L', category: 'Sembako', unit: 'pouch', stock: 4, sellPrice: 38000, costPrice: 34000, reorderPoint: 6 },
  { name: 'Gula 1kg', category: 'Sembako', unit: 'kg', stock: 22, sellPrice: 16000, costPrice: 14000 },
  { name: 'Rokok Surya', category: 'Rokok', unit: 'bungkus', stock: 40, sellPrice: 25000, costPrice: 23000 },
  { name: 'Aqua Galon 19L', category: 'Minuman', unit: 'galon', stock: 25, sellPrice: 20000, costPrice: 17000, isRoutine: true },
  { name: 'Sirup Marjan Cocopandan', category: 'Minuman', unit: 'botol', stock: 2, sellPrice: 28000, costPrice: 24000, reorderPoint: 5 },
  { name: 'Kopi Kapal Api', category: 'Minuman', unit: 'sachet', stock: 60, sellPrice: 1500, costPrice: 1200 },
  { name: 'Chitato', category: 'Snack', unit: 'pcs', stock: 18, sellPrice: 12000, costPrice: 10000 },
];
const products = await Product.insertMany(catalog.map((p) => ({ ...p, shopId: shop._id, aliases: [p.name.toLowerCase()] })));
const byName = Object.fromEntries(products.map((p) => [p.name, p]));

// --- loyalty customers (QR-registered, opted in) ---
const loyaltyNames = ['Sari', 'Kevin', 'Andre', 'Dewi', 'Rina', 'Tono', 'Lina', 'Bagus', 'Maya', 'Yuni', 'Fajar', 'Citra'];
const loyaltyCustomers = await Customer.insertMany(
  loyaltyNames.map((name, i) => ({
    shopId: shop._id,
    name,
    phone: `+62812345${String(1000 + i).padStart(4, '0')}`,
    aliases: [name.toLowerCase()],
    loyalty: { points: 2 + (i % 5), stamps: 2 + (i % 5), joinedVia: 'qr' },
    optInBroadcast: true,
  })),
);

// --- helper: build a committed sale ---
let txnSeq = 0;
function sale({ items, customerId, committedAt }) {
  const built = items.map(([productName, qty]) => {
    const product = byName[productName];
    const unitPrice = product.sellPrice;
    return { productId: product._id, name: product.name, action: 'sale', qty, unit: product.unit, unitPrice, lineTotal: qty * unitPrice };
  });
  const totalAmount = built.reduce((t, it) => t + it.lineTotal, 0);
  txnSeq += 1;
  return {
    shopId: shop._id,
    type: 'sale',
    status: 'committed',
    source: 'text',
    whatsappMessageId: `seed-${txnSeq}`,
    items: built,
    totalAmount,
    cashDelta: totalAmount,
    customerId: customerId ?? null,
    committedAt,
  };
}

// --- 7-day sales trend (Mon..today). More volume on recent days. ---
const dayPlans = [
  { d: 6, baskets: [[['Beras 5kg', 2], ['Kopi Kapal Api', 10]], [['Rokok Surya', 3]], [['Gula 1kg', 4]]] },
  { d: 5, baskets: [[['Aqua Galon 19L', 3]], [['Minyak Goreng 2L', 2], ['Chitato', 2]], [['Rokok Surya', 4]]] },
  { d: 4, baskets: [[['Beras 5kg', 1]], [['Kopi Kapal Api', 8]], [['Gula 1kg', 2]]] },
  { d: 3, baskets: [[['Rokok Surya', 5]], [['Aqua Galon 19L', 2]], [['Sirup Marjan Cocopandan', 1]], [['Chitato', 3]]] },
  { d: 2, baskets: [[['Beras 5kg', 2]], [['Minyak Goreng 2L', 1]], [['Rokok Surya', 4]], [['Kopi Kapal Api', 12]]] },
  { d: 1, baskets: [[['Beras 5kg', 3]], [['Aqua Galon 19L', 4]], [['Rokok Surya', 5]], [['Gula 1kg', 3]]] },
  { d: 0, baskets: [[['Beras 5kg', 3]], [['Rokok Surya', 6]], [['Aqua Galon 19L', 3]], [['Minyak Goreng 2L', 2]], [['Chitato', 4]]] },
];

const txns = [];
for (const plan of dayPlans) {
  plan.baskets.forEach((items, idx) => {
    // link some baskets to loyalty customers (for RFM/loyalty)
    const customer = idx < loyaltyCustomers.length ? loyaltyCustomers[(plan.d + idx) % loyaltyCustomers.length] : null;
    txns.push(sale({ items, customerId: customer?._id, committedAt: atDaysAgo(plan.d, 9 + idx) }));
  });
}
// a routine buyer: Sari buys Aqua Galon every ~3 days (for restock prediction)
for (const d of [12, 9, 6, 3]) {
  txns.push(sale({ items: [['Aqua Galon 19L', 1]], customerId: loyaltyCustomers[0]._id, committedAt: atDaysAgo(d) }));
}
await Transaction.insertMany(txns);

// --- kasbon customers + credit scores ---
const budi = await Customer.create({ shopId: shop._id, name: 'Budi', phone: '+6281299990001', aliases: ['budi'] });
const andi = await Customer.create({ shopId: shop._id, name: 'Andi', phone: '+6281299990002', aliases: ['andi'] });

await Kasbon.create({
  shopId: shop._id, customerId: budi._id, status: 'open',
  items: [{ name: 'Rokok Surya', qty: 5, unitPrice: 25000, lineTotal: 125000 }, { name: 'Kopi Kapal Api', qty: 13, unitPrice: 1500, lineTotal: 20000 }],
  amount: 145000, originalAmount: 145000, dueDate: atDaysAgo(10),
});
await Kasbon.create({
  shopId: shop._id, customerId: andi._id, status: 'open',
  items: [{ name: 'Beras 5kg', qty: 3, unitPrice: 65000, lineTotal: 195000 }, { name: 'Gula 1kg', qty: 1, unitPrice: 15000, lineTotal: 15000 }],
  amount: 210000, originalAmount: 210000, dueDate: atDaysAgo(4),
});
await refreshCustomerCreditScore(budi); // overdue 10d, 145k -> risky
await refreshCustomerCreditScore(andi); // overdue 4d, 210k -> watch

// --- summary ---
const todaySales = txns.filter((t) => t.committedAt >= atDaysAgo(0, 0));
const omzetToday = todaySales.reduce((s, t) => s + t.totalAmount, 0);
console.log('\n✓ Seeded demo warung:', shop.name, `(slug: ${SLUG})`);
console.log('  products:', products.length, '| loyalty customers:', loyaltyCustomers.length, '| sales txns:', txns.length);
console.log('  kasbon customers: Budi (risky), Andi (watch)');
console.log('  omzet today (approx):', omzetToday.toLocaleString('id-ID'));
console.log('  low-stock items: Minyak Goreng 2L (4), Sirup Marjan (2)');
console.log(`  dashboard: http://localhost:3000/dashboard?token=${DASHBOARD_TOKEN}`);
console.log('\n  Inspect with: npm run db:inspect');

await mongoose.disconnect();
