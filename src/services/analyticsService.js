import { config } from '../config/index.js';
import { Customer } from '../models/Customer.js';
import { Kasbon } from '../models/Kasbon.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { Transaction } from '../models/Transaction.js';
import { normalizePhone } from '../utils/phone.js';

const MS_PER_DAY = 86_400_000;
const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function monthRange(month, now = new Date()) {
  const match = String(month ?? '').match(/^(\d{4})-(\d{2})$/u);
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 1);
  return { from, to, label: `${year}-${String(monthIndex + 1).padStart(2, '0')}` };
}

async function lean(query) {
  return typeof query?.lean === 'function' ? query.lean() : query;
}

function pctDelta(current, previous) {
  if (!previous) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function creditworthiness(customer) {
  const risk = customer.creditScore?.value ?? 0;
  return Math.max(0, Math.min(100, 100 - Math.round(risk / 20_000)));
}

function daysOverdue(dueDate, now = new Date()) {
  if (!dueDate) {
    return 0;
  }
  return Math.max(0, Math.floor((startOfDay(now) - startOfDay(new Date(dueDate))) / MS_PER_DAY));
}

export async function getShopByOwnerPhone(ownerPhone) {
  const normalizedOwnerPhone = normalizePhone(ownerPhone);
  if (!normalizedOwnerPhone) {
    return null;
  }
  return Shop.findOne({ ownerPhone: normalizedOwnerPhone });
}

async function committedSales({ shopId, from, to }) {
  return lean(
    Transaction.find({
      shopId,
      type: 'sale',
      status: 'committed',
      committedAt: { $gte: from, $lt: to },
    }),
  );
}

export async function getDashboardSummary(shop, { now = new Date() } = {}) {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  const [todaySales, yesterdaySales, openKasbons, customers] = await Promise.all([
    committedSales({ shopId: shop._id, from: today, to: tomorrow }),
    committedSales({ shopId: shop._id, from: yesterday, to: today }),
    lean(Kasbon.find({ shopId: shop._id, status: 'open' })),
    lean(Customer.find({ shopId: shop._id, phone: { $exists: true, $ne: null } })),
  ]);

  const omzetToday = todaySales.reduce((total, txn) => total + (txn.totalAmount ?? 0), 0);
  const omzetYesterday = yesterdaySales.reduce((total, txn) => total + (txn.totalAmount ?? 0), 0);
  const newToday = customers.filter((customer) => {
    if (!customer.createdAt) {
      return false;
    }
    const createdAt = new Date(customer.createdAt);
    return createdAt >= today && createdAt < tomorrow;
  }).length;

  return {
    shop: {
      name: shop.name,
      ownerName: shop.ownerName,
      tier: shop.tier,
    },
    omzet: { value: omzetToday, deltaPct: pctDelta(omzetToday, omzetYesterday), vs: 'kemarin' },
    piutang: {
      value: openKasbons.reduce((total, kasbon) => total + (kasbon.amount ?? 0), 0),
      overdueCount: openKasbons.filter((kasbon) => daysOverdue(kasbon.dueDate, now) > 0).length,
    },
    loyalty: { count: customers.length, newToday },
    txnToday: {
      count: todaySales.length,
      deltaPct: pctDelta(todaySales.length, yesterdaySales.length),
    },
  };
}

export async function getSalesTrend(shop, { days = 7, now = new Date() } = {}) {
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 31);
  const end = addDays(startOfDay(now), 1);
  const start = addDays(end, -safeDays);
  const sales = await committedSales({ shopId: shop._id, from: start, to: end });
  const totals = new Map();

  for (const txn of sales) {
    const key = startOfDay(new Date(txn.committedAt)).toISOString();
    totals.set(key, (totals.get(key) ?? 0) + (txn.totalAmount ?? 0));
  }

  const labels = [];
  const values = [];
  for (let i = 0; i < safeDays; i += 1) {
    const day = addDays(start, i);
    labels.push(DAY_LABELS[day.getDay()]);
    values.push(totals.get(day.toISOString()) ?? 0);
  }

  return { labels, values };
}

async function productMap(shopId) {
  const products = await lean(Product.find({ shopId }));
  return new Map(products.map((product) => [String(product._id), product]));
}

export async function getCategoryMix(shop, { now = new Date() } = {}) {
  const end = addDays(startOfDay(now), 1);
  const start = addDays(end, -30);
  const [sales, products] = await Promise.all([
    committedSales({ shopId: shop._id, from: start, to: end }),
    productMap(shop._id),
  ]);
  const totals = new Map();

  for (const txn of sales) {
    for (const item of txn.items ?? []) {
      const product = item.productId ? products.get(String(item.productId)) : null;
      const category = product?.category ?? 'Lainnya';
      totals.set(category, (totals.get(category) ?? 0) + (item.lineTotal ?? 0));
    }
  }

  return [...totals.entries()]
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
}

export async function getTopItems(shop, { now = new Date(), limit = 5 } = {}) {
  const end = addDays(startOfDay(now), 1);
  const start = addDays(end, -30);
  const sales = await committedSales({ shopId: shop._id, from: start, to: end });
  const totals = new Map();

  for (const txn of sales) {
    for (const item of txn.items ?? []) {
      const key = item.name;
      const current = totals.get(key) ?? { name: item.name, qty: 0, value: 0 };
      current.qty += item.qty ?? 0;
      current.value += item.lineTotal ?? 0;
      totals.set(key, current);
    }
  }

  return [...totals.values()].sort((a, b) => b.value - a.value).slice(0, limit);
}

export async function getPredictiveRestock(shop) {
  const since = new Date(Date.now() - config.limits.salesWindowDays * MS_PER_DAY);
  const [products, sales] = await Promise.all([
    lean(Product.find({ shopId: shop._id })),
    lean(
      Transaction.find({
        shopId: shop._id,
        type: 'sale',
        status: 'committed',
        committedAt: { $gte: since },
      }),
    ),
  ]);
  const soldQty = new Map();
  for (const txn of sales) {
    for (const item of txn.items ?? []) {
      if (!item.productId) {
        continue;
      }
      const key = String(item.productId);
      soldQty.set(key, (soldQty.get(key) ?? 0) + (item.qty ?? 0));
    }
  }

  return products
    .map((product) => {
      const dailySales = (soldQty.get(String(product._id)) ?? 0) / config.limits.salesWindowDays;
      const daysToStockout = dailySales > 0 ? Math.ceil((product.stock ?? 0) / dailySales) : null;
      const urgent =
        (product.reorderPoint != null && (product.stock ?? 0) <= product.reorderPoint) ||
        (daysToStockout != null && daysToStockout <= config.limits.restockLeadTimeDays);

      return {
        name: product.name,
        remaining: product.stock ?? 0,
        unit: product.unit ?? 'unit',
        daysToStockout,
        urgency: urgent ? 'urgent' : 'watch',
      };
    })
    .filter((item) => item.urgency === 'urgent' || item.daysToStockout != null)
    .sort((a, b) => (a.daysToStockout ?? 9999) - (b.daysToStockout ?? 9999))
    .slice(0, 6);
}

export async function getCreditScores(shop, { now = new Date() } = {}) {
  const [openKasbons, customers] = await Promise.all([
    lean(Kasbon.find({ shopId: shop._id, status: 'open' })),
    lean(Customer.find({ shopId: shop._id })),
  ]);
  const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));
  const grouped = new Map();

  for (const kasbon of openKasbons) {
    const key = String(kasbon.customerId);
    const current = grouped.get(key) ?? {
      customer: customerById.get(key),
      debt: 0,
      maxDaysOverdue: 0,
    };
    current.debt += kasbon.amount ?? 0;
    current.maxDaysOverdue = Math.max(current.maxDaysOverdue, daysOverdue(kasbon.dueDate, now));
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .filter((item) => item.customer)
    .map(({ customer, debt, maxDaysOverdue }) => ({
      name: customer.name ?? 'Pelanggan',
      debt,
      lateNote: maxDaysOverdue > 0 ? `Telat ${maxDaysOverdue} hari` : 'Belum jatuh tempo',
      score: creditworthiness(customer),
      band: customer.creditScore?.band ?? 'good',
    }))
    .sort((a, b) => a.score - b.score);
}

export async function buildMonthlyExcelExport(shop, { month, now = new Date() } = {}) {
  if (shop.tier !== 'premium') {
    return { ok: false, reason: 'premium_required' };
  }

  const { from, to, label } = monthRange(month, now);
  const transactions = await lean(
    Transaction.find({
      shopId: shop._id,
      status: 'committed',
      committedAt: { $gte: from, $lt: to },
    }),
  );
  const rows = transactions.flatMap((txn) =>
    (txn.items ?? []).map((item) => ({
      date: new Date(txn.committedAt ?? txn.createdAt).toISOString().slice(0, 10),
      type: txn.type,
      item: item.name,
      qty: item.qty ?? 0,
      unitPrice: item.unitPrice ?? 0,
      lineTotal: item.lineTotal ?? 0,
    })),
  );
  const total = rows.reduce((sum, row) => sum + row.lineTotal, 0);
  const xmlRows = [
    ['Tanggal', 'Tipe', 'Barang', 'Qty', 'Harga Satuan', 'Total'],
    ...rows.map((row) => [row.date, row.type, row.item, row.qty, row.unitPrice, row.lineTotal]),
    ['', '', 'TOTAL', '', '', total],
  ]
    .map(
      (row) =>
        `<Row>${row
          .map(
            (cell) =>
              `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${escapeXml(cell)}</Data></Cell>`,
          )
          .join('')}</Row>`,
    )
    .join('');
  const body = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Laporan ${escapeXml(label)}">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;

  return {
    ok: true,
    filename: `warungai-${shop.loyaltyQrSlug}-${label}.xls`,
    contentType: 'application/vnd.ms-excel',
    body,
  };
}
