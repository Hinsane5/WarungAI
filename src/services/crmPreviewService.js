// Read-only "what the nightly Proactive CRM batch would do tonight" — it mirrors
// runPredictiveRestock + runCrmNotifier exactly (same logic + message text), but it
// SENDS nothing and WRITES nothing. Safe to run repeatedly for a live demo without
// WhatsApp and without mutating data (no quota decrement, no "reminder sent" marks).
//
// Later, the "live" mode is a separate trigger that calls the real jobs (which persist
// and deliver via the messaging provider).
import { config } from '../config/index.js';
import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import {
  computeRfmForCustomer,
  evaluateStock,
  isRestockReminderDue,
  predictCustomerRestocks,
} from './crmService.js';
import { formatLowStockMessage, soldQtyByProduct } from '../jobs/predictiveRestock.js';
import { restockMessage } from '../jobs/crmNotifier.js';

const MS_PER_DAY = 86_400_000;

export async function previewProactiveCrm(shop, { now = new Date() } = {}) {
  const since = new Date(now.getTime() - config.limits.salesWindowDays * MS_PER_DAY);
  const products = await Product.find({ shopId: shop._id });
  const soldQty = await soldQtyByProduct({ shopId: shop._id, since });

  // --- Owner low-stock alert (unmetered in the real job) ---
  const flagged = [];
  for (const product of products) {
    const evaluation = evaluateStock({
      product,
      totalQtySold: soldQty.get(String(product._id)) ?? 0,
      now,
    });
    if (evaluation.flagged) {
      flagged.push({ product, ...evaluation });
    }
  }
  const ownerAlert =
    flagged.length > 0 ? { to: shop.ownerPhone, message: formatLowStockMessage(flagged) } : null;

  // --- Customer reminders + RFM segmentation ---
  const routineProductIds = products.filter((product) => product.isRoutine).map((p) => p._id);
  const productNameById = new Map(products.map((p) => [String(p._id), p.name]));
  const customers = await Customer.find({
    shopId: shop._id,
    phone: { $exists: true, $ne: null },
  });

  const segments = [];
  const customerReminders = [];
  for (const customer of customers) {
    const rfm = await computeRfmForCustomer({ shopId: shop._id, customerId: customer._id, now });
    segments.push({ name: customer.name, phone: customer.phone, segment: rfm.segment });

    if (routineProductIds.length === 0 || customer.optInBroadcast === false) {
      continue;
    }

    const predictions = await predictCustomerRestocks({
      shopId: shop._id,
      customerId: customer._id,
      routineProductIds,
      now,
    });
    const storedByProduct = new Map(
      (customer.restockPredictions ?? []).map((p) => [String(p.productId), p]),
    );

    for (const prediction of predictions) {
      const merged = {
        ...prediction,
        lastReminderAt: storedByProduct.get(String(prediction.productId))?.lastReminderAt,
      };
      if (!isRestockReminderDue(merged, { now })) {
        continue;
      }

      const productName = productNameById.get(String(prediction.productId)) ?? 'barang rutin';
      customerReminders.push({
        name: customer.name,
        phone: customer.phone,
        segment: rfm.segment,
        productName,
        message: restockMessage({ shop, product: { name: productName }, segment: rfm.segment }),
      });
    }
  }

  const koinBotBalance = shop.quotas?.koinBotBalance ?? 0;
  return {
    mode: 'preview',
    ranAt: now.toISOString(),
    summary: {
      customersSegmented: segments.length,
      ownerAlerts: ownerAlert ? 1 : 0,
      customerReminders: customerReminders.length,
      koinBotBalance,
      koinBotNeeded: customerReminders.length,
      koinBotEnabled: config.limits.koinBotEnabled,
    },
    ownerAlert,
    customerReminders,
    segments,
  };
}
