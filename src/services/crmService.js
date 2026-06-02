// Deterministic CRM analytics — no LLM. Predictive restock + RFM segmentation.
// Pure helpers are exported for unit testing; DB-touching helpers fetch committed sales.
import { config } from '../config/index.js';
import { Transaction } from '../models/Transaction.js';

const MS_PER_DAY = 86_400_000;

function daysBetween(from, to) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY));
}

// ---- Owner-facing low-stock detection (pure) ----

// avgDailySales = total qty sold in window / window days.
export function avgDailySales(totalQty, windowDays) {
  return windowDays > 0 ? totalQty / windowDays : 0;
}

export function daysToStockout(stock, dailySales) {
  if (dailySales <= 0) {
    return Infinity;
  }
  return stock / dailySales;
}

// Decide whether a product should be flagged to the owner, with a reason.
export function evaluateStock({ product, totalQtySold, now = new Date() }) {
  const dailySales = avgDailySales(totalQtySold, config.limits.salesWindowDays);
  const dtos = daysToStockout(product.stock ?? 0, dailySales);

  if (product.reorderPoint != null && (product.stock ?? 0) <= product.reorderPoint) {
    return { flagged: true, reason: 'reorder_point', daysToStockout: dtos };
  }

  if (Number.isFinite(dtos) && dtos <= config.limits.restockLeadTimeDays) {
    return { flagged: true, reason: 'predicted_stockout', daysToStockout: dtos };
  }

  if (product.expiryDate) {
    const daysToExpiry = daysBetween(now, new Date(product.expiryDate));
    if (new Date(product.expiryDate) >= now && daysToExpiry <= config.limits.expiryWarnDays) {
      return { flagged: true, reason: 'expiring', daysToExpiry };
    }
  }

  return { flagged: false, daysToStockout: dtos };
}

// ---- RFM (pure) ----

export function segmentForRfm({ recencyDays, frequency }) {
  if (frequency <= 0) {
    return 'dormant';
  }
  if (frequency >= 4 && recencyDays <= 14) {
    return 'champion';
  }
  if (frequency >= 2 && recencyDays <= 30) {
    return 'loyal';
  }
  if (recencyDays <= 7) {
    return 'new';
  }
  if (recencyDays > 45) {
    return 'dormant';
  }
  return 'at_risk';
}

export function promoForSegment(segment) {
  switch (segment) {
    case 'champion':
      return 'Sebagai pelanggan setia, ada bonus poin ekstra minggu ini.';
    case 'loyal':
      return 'Terima kasih sudah sering belanja. Cek promo bundle hemat kami.';
    case 'at_risk':
      return 'Sudah lama tidak mampir? Ada promo spesial buat kamu.';
    case 'new':
      return 'Selamat datang! Kumpulkan stempel untuk hadiah menarik.';
    default:
      return 'Mampir lagi ya, banyak kebutuhan harian tersedia di warung.';
  }
}

// ---- DB-touching aggregations ----

async function committedSalesForCustomer({ shopId, customerId, since }) {
  const query = Transaction.find({
    shopId,
    customerId,
    type: 'sale',
    status: 'committed',
    committedAt: { $gte: since },
  });
  return typeof query.lean === 'function' ? query.lean() : query;
}

export async function computeRfmForCustomer({ shopId, customerId, now = new Date() }) {
  const since = new Date(now.getTime() - config.limits.salesWindowDays * MS_PER_DAY);
  const sales = await committedSalesForCustomer({ shopId, customerId, since });

  const frequency = sales.length;
  const monetary = sales.reduce((total, txn) => total + (txn.totalAmount ?? 0), 0);
  const lastSale = sales.reduce((latest, txn) => {
    const at = new Date(txn.committedAt ?? txn.createdAt ?? now);
    return at > latest ? at : latest;
  }, new Date(0));
  const recencyDays = frequency > 0 ? daysBetween(lastSale, now) : Number.MAX_SAFE_INTEGER;
  const segment = segmentForRfm({ recencyDays, frequency });

  return { recencyDays: frequency > 0 ? recencyDays : null, frequency, monetary, segment };
}

// Predict per-routine-item rebuy cycle for one customer from their purchase history.
export async function predictCustomerRestocks({
  shopId,
  customerId,
  routineProductIds,
  now = new Date(),
}) {
  if (!routineProductIds?.length) {
    return [];
  }

  const since = new Date(now.getTime() - 90 * MS_PER_DAY);
  const sales = await committedSalesForCustomer({ shopId, customerId, since });
  const routineSet = new Set(routineProductIds.map(String));
  const datesByProduct = new Map();

  for (const txn of sales) {
    const at = new Date(txn.committedAt ?? txn.createdAt ?? now);
    for (const item of txn.items ?? []) {
      if (!item.productId || !routineSet.has(String(item.productId))) {
        continue;
      }
      const key = String(item.productId);
      datesByProduct.set(key, [...(datesByProduct.get(key) ?? []), at]);
    }
  }

  const predictions = [];
  for (const [productId, dates] of datesByProduct) {
    if (dates.length < 2) {
      continue;
    }
    const sorted = dates.sort((a, b) => a - b);
    const span = daysBetween(sorted[0], sorted[sorted.length - 1]);
    const avgCycleDays = Math.max(1, Math.round(span / (sorted.length - 1)));
    const nextExpectedDate = new Date(sorted[sorted.length - 1].getTime() + avgCycleDays * MS_PER_DAY);
    predictions.push({ productId, avgCycleDays, nextExpectedDate });
  }

  return predictions;
}

export function isRestockReminderDue(prediction, { now = new Date() } = {}) {
  if (!prediction?.nextExpectedDate) {
    return false;
  }
  const leadMs = config.limits.restockLeadTimeDays * MS_PER_DAY;
  const dueBy = new Date(prediction.nextExpectedDate).getTime() - leadMs;
  if (now.getTime() < dueBy) {
    return false;
  }
  // don't re-remind within the cycle
  if (prediction.lastReminderAt) {
    const sinceReminder = daysBetween(new Date(prediction.lastReminderAt), now);
    if (sinceReminder < prediction.avgCycleDays) {
      return false;
    }
  }
  return true;
}
