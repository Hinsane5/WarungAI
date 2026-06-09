import { config } from '../config/index.js';
import { Customer } from '../models/Customer.js';
import { Kasbon } from '../models/Kasbon.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { Transaction } from '../models/Transaction.js';

const MS_PER_DAY = 86_400_000;
const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function timeZoneForShop(shop) {
  return shop.settings?.timezone ?? config.jobs.timezone ?? 'Asia/Jakarta';
}

function datePartsInTimeZone(date = new Date(), timeZone = 'Asia/Jakarta') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
}

function utcDateForTimeZoneParts({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const actual = datePartsInTimeZone(utcGuess, timeZone);
  const desiredMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const actualMs = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
    actual.second,
  );

  return new Date(utcGuess.getTime() + desiredMs - actualMs);
}

function startOfDay(date = new Date(), timeZone = 'Asia/Jakarta') {
  const { year, month, day } = datePartsInTimeZone(date, timeZone);
  return utcDateForTimeZoneParts({ year, month, day }, timeZone);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dayLabel(date, timeZone) {
  const { year, month, day } = datePartsInTimeZone(date, timeZone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return DAY_LABELS[weekday];
}

function dayKey(date, timeZone) {
  const { year, month, day } = datePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthRange(month, now = new Date(), timeZone = 'Asia/Jakarta') {
  const match = String(month ?? '').match(/^(\d{4})-(\d{2})$/u);
  const nowParts = datePartsInTimeZone(now, timeZone);
  const year = match ? Number(match[1]) : nowParts.year;
  const monthIndex = match ? Number(match[2]) - 1 : nowParts.month - 1;
  const from = utcDateForTimeZoneParts({ year, month: monthIndex + 1, day: 1 }, timeZone);
  const to = utcDateForTimeZoneParts({ year, month: monthIndex + 2, day: 1 }, timeZone);
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

function daysOverdue(dueDate, now = new Date(), timeZone = 'Asia/Jakarta') {
  if (!dueDate) {
    return 0;
  }
  return Math.max(
    0,
    Math.floor((startOfDay(now, timeZone) - startOfDay(new Date(dueDate), timeZone)) / MS_PER_DAY),
  );
}

export async function getShopByDashboardToken(token) {
  const dashboardToken = String(token ?? '').trim();
  if (!dashboardToken) {
    return null;
  }
  return Shop.findOne({ dashboardToken });
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
  const timeZone = timeZoneForShop(shop);
  const today = startOfDay(now, timeZone);
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
      overdueCount: openKasbons.filter((kasbon) => daysOverdue(kasbon.dueDate, now, timeZone) > 0)
        .length,
    },
    loyalty: { count: customers.length, newToday },
    txnToday: {
      count: todaySales.length,
      deltaPct: pctDelta(todaySales.length, yesterdaySales.length),
    },
  };
}

export async function getSalesTrend(shop, { days = 7, now = new Date() } = {}) {
  const timeZone = timeZoneForShop(shop);
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 31);
  const end = addDays(startOfDay(now, timeZone), 1);
  const start = addDays(end, -safeDays);
  const sales = await committedSales({ shopId: shop._id, from: start, to: end });
  const totals = new Map();

  for (const txn of sales) {
    const key = dayKey(new Date(txn.committedAt), timeZone);
    totals.set(key, (totals.get(key) ?? 0) + (txn.totalAmount ?? 0));
  }

  const labels = [];
  const values = [];
  for (let i = 0; i < safeDays; i += 1) {
    const day = addDays(start, i);
    labels.push(dayLabel(day, timeZone));
    values.push(totals.get(dayKey(day, timeZone)) ?? 0);
  }

  return { labels, values };
}

async function productMap(shopId) {
  const products = await lean(Product.find({ shopId }));
  return new Map(products.map((product) => [String(product._id), product]));
}

export async function getCategoryMix(shop, { now = new Date() } = {}) {
  const end = addDays(startOfDay(now, timeZoneForShop(shop)), 1);
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
  const end = addDays(startOfDay(now, timeZoneForShop(shop)), 1);
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
    .filter((item) => item.urgency === 'urgent')
    .sort((a, b) => (a.daysToStockout ?? 9999) - (b.daysToStockout ?? 9999))
    .slice(0, 6);
}

// Daily recap figures for one shop, from the start of the shop's local day until `now`:
// today's omzet + committed sale count, new kasbon recorded today, and low-stock names.
export async function getDailyRecap(shop, { now = new Date() } = {}) {
  const timeZone = timeZoneForShop(shop);
  const today = startOfDay(now, timeZone);

  const [sales, newKasbons, lowStock] = await Promise.all([
    lean(
      Transaction.find({
        shopId: shop._id,
        type: 'sale',
        status: 'committed',
        committedAt: { $gte: today, $lt: now },
      }),
    ),
    lean(Kasbon.find({ shopId: shop._id, createdAt: { $gte: today, $lt: now } })),
    getPredictiveRestock(shop),
  ]);

  const date = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  return {
    date, // e.g. "Selasa, 9 Juni 2026"
    omzet: sales.reduce((total, txn) => total + (txn.totalAmount ?? 0), 0),
    txnCount: sales.length,
    // New debt opened today (kasbon docs created today). Appends to an existing open
    // kasbon keep the original createdAt, so this is "new kasbon accounts opened today".
    kasbonBaru: newKasbons.reduce((total, k) => total + (k.originalAmount ?? k.amount ?? 0), 0),
    lowStock: lowStock.map((item) => item.name),
  };
}

export async function getCreditScores(shop, { now = new Date() } = {}) {
  const timeZone = timeZoneForShop(shop);
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
    current.maxDaysOverdue = Math.max(
      current.maxDaysOverdue,
      daysOverdue(kasbon.dueDate, now, timeZone),
    );
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

export async function listDashboardCustomers(shop) {
  const [customers, openKasbons] = await Promise.all([
    lean(Customer.find({ shopId: shop._id })),
    lean(Kasbon.find({ shopId: shop._id, status: 'open' })),
  ]);
  const debtByCustomerId = new Map();

  for (const kasbon of openKasbons) {
    const key = String(kasbon.customerId);
    debtByCustomerId.set(key, (debtByCustomerId.get(key) ?? 0) + (kasbon.amount ?? 0));
  }

  return customers
    .map((customer) => {
      const id = String(customer._id);
      return {
        id,
        name: customer.name ?? 'Pelanggan',
        phone: customer.phone ?? '',
        points: customer.loyalty?.points ?? 0,
        stamps: customer.loyalty?.stamps ?? 0,
        segment: customer.rfm?.segment ?? 'unsegmented',
        outstandingKasbon: debtByCustomerId.get(id) ?? 0,
        creditBand: customer.creditScore?.band ?? 'good',
        creditScore: creditworthiness(customer),
      };
    })
    .sort((a, b) => b.outstandingKasbon - a.outstandingKasbon || a.name.localeCompare(b.name));
}

// Manually add a customer from the Pelanggan page (joinedVia: 'manual'). Phone is unique
// per shop (sparse index) — a duplicate phone returns a structured error.
export async function createDashboardCustomer(shop, input) {
  const name = String(input.name ?? '').trim();
  const phone = String(input.phone ?? '').trim();

  const doc = {
    shopId: shop._id,
    name,
    aliases: name ? [name.toLowerCase()] : [],
    loyalty: { points: 0, stamps: 0, joinedVia: 'manual' },
    optInBroadcast: input.optInBroadcast ?? true,
  };
  if (phone) {
    doc.phone = phone;
  }

  try {
    const created = await Customer.create(doc);
    return { ok: true, id: String(created._id) };
  } catch (error) {
    if (error?.code === 11000) {
      return { ok: false, reason: 'duplicate_customer' };
    }
    throw error;
  }
}

export async function buildMonthlyExcelExport(shop, { month, now = new Date() } = {}) {
  if (shop.tier !== 'premium') {
    return { ok: false, reason: 'premium_required' };
  }

  const { from, to, label } = monthRange(month, now, timeZoneForShop(shop));
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
