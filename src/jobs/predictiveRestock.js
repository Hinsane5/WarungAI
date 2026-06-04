import { config } from '../config/index.js';
import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { Transaction } from '../models/Transaction.js';
import { notifyOwner } from '../services/broadcastService.js';
import { evaluateStock, predictCustomerRestocks } from '../services/crmService.js';
import { logger } from '../utils/logger.js';

const MS_PER_DAY = 86_400_000;

export async function soldQtyByProduct({ shopId, since }) {
  const query = Transaction.find({
    shopId,
    type: 'sale',
    status: 'committed',
    committedAt: { $gte: since },
  });
  const sales = typeof query.lean === 'function' ? await query.lean() : await query;

  const map = new Map();
  for (const txn of sales) {
    for (const item of txn.items ?? []) {
      if (!item.productId) {
        continue;
      }
      const key = String(item.productId);
      map.set(key, (map.get(key) ?? 0) + (item.qty ?? 0));
    }
  }
  return map;
}

export function formatLowStockMessage(flagged) {
  const lines = ['Pengingat stok dari WarungAI:'];
  for (const f of flagged) {
    if (f.reason === 'expiring') {
      lines.push(`- ${f.product.name}: akan kadaluarsa dalam ${f.daysToExpiry} hari (stok ${f.product.stock}).`);
    } else if (f.reason === 'reorder_point') {
      lines.push(`- ${f.product.name}: stok ${f.product.stock} di bawah batas minimum.`);
    } else {
      lines.push(`- ${f.product.name}: diperkirakan habis ~${Math.ceil(f.daysToStockout)} hari lagi (stok ${f.product.stock}).`);
    }
  }
  lines.push('Saatnya kulakan ya.');
  return lines.join('\n');
}

// Nightly: flag low/expiring stock to owners (unmetered) and refresh per-customer
// routine restock predictions for crmNotifier to act on. Pure callable (cron + HTTP trigger).
export async function runPredictiveRestock({ now = new Date(), shopFilter = {} } = {}) {
  const shops = await Shop.find(shopFilter);
  let shopsProcessed = 0;
  let ownersNotified = 0;
  let customersUpdated = 0;

  for (const shop of shops) {
    shopsProcessed += 1;
    const since = new Date(now.getTime() - config.limits.salesWindowDays * MS_PER_DAY);
    const soldQty = await soldQtyByProduct({ shopId: shop._id, since });
    const products = await Product.find({ shopId: shop._id });

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

    if (flagged.length > 0) {
      const result = await notifyOwner(shop, formatLowStockMessage(flagged));
      if (result.sent) {
        ownersNotified += 1;
      }
    }

    const routineProductIds = products.filter((p) => p.isRoutine).map((p) => p._id);
    if (routineProductIds.length > 0) {
      const customers = await Customer.find({
        shopId: shop._id,
        phone: { $exists: true, $ne: null },
      });
      for (const customer of customers) {
        const predictions = await predictCustomerRestocks({
          shopId: shop._id,
          customerId: customer._id,
          routineProductIds,
          now,
        });
        if (predictions.length === 0) {
          continue;
        }
        const existing = new Map(
          (customer.restockPredictions ?? []).map((p) => [String(p.productId), p]),
        );
        customer.restockPredictions = predictions.map((p) => ({
          ...p,
          lastReminderAt: existing.get(String(p.productId))?.lastReminderAt,
        }));
        await customer.save();
        customersUpdated += 1;
      }
    }
  }

  logger.info({ shopsProcessed, ownersNotified, customersUpdated }, 'predictiveRestock complete');
  return { shopsProcessed, ownersNotified, customersUpdated };
}
