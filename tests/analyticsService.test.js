import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shopFindOneMock = vi.hoisted(() => vi.fn());
const transactionFindMock = vi.hoisted(() => vi.fn());
const productFindMock = vi.hoisted(() => vi.fn());
const customerFindMock = vi.hoisted(() => vi.fn());
const kasbonFindMock = vi.hoisted(() => vi.fn());

vi.mock('../src/models/Shop.js', () => ({
  Shop: {
    findOne: shopFindOneMock,
  },
}));

vi.mock('../src/models/Transaction.js', () => ({
  Transaction: {
    find: transactionFindMock,
  },
}));

vi.mock('../src/models/Product.js', () => ({
  Product: {
    find: productFindMock,
  },
}));

vi.mock('../src/models/Customer.js', () => ({
  Customer: {
    find: customerFindMock,
  },
}));

vi.mock('../src/models/Kasbon.js', () => ({
  Kasbon: {
    find: kasbonFindMock,
  },
}));

const {
  buildMonthlyExcelExport,
  getDashboardSummary,
  getSalesTrend,
  getShopByOwnerPhone,
  getTopItems,
} = await import('../src/services/analyticsService.js');

const shop = {
  _id: 'shop-1',
  name: 'Warung Sri',
  ownerPhone: '+628123',
  ownerName: 'Sri',
  tier: 'premium',
  loyaltyQrSlug: 'warung-sri',
};

const products = [
  { _id: 'product-1', name: 'Indomie', category: 'Makanan', stock: 5, unit: 'pcs' },
  { _id: 'product-2', name: 'Aqua', category: 'Minuman', stock: 2, unit: 'botol' },
];

const transactions = [
  {
    shopId: 'shop-1',
    type: 'sale',
    status: 'committed',
    committedAt: new Date('2026-06-02T03:00:00.000Z'),
    totalAmount: 10000,
    items: [{ productId: 'product-1', name: 'Indomie', qty: 2, unitPrice: 5000, lineTotal: 10000 }],
  },
  {
    shopId: 'shop-1',
    type: 'sale',
    status: 'pending',
    committedAt: new Date('2026-06-02T04:00:00.000Z'),
    totalAmount: 999999,
    items: [{ productId: 'product-2', name: 'Aqua', qty: 9, unitPrice: 9999, lineTotal: 999999 }],
  },
  {
    shopId: 'shop-1',
    type: 'sale',
    status: 'committed',
    committedAt: new Date('2026-06-01T03:00:00.000Z'),
    totalAmount: 5000,
    items: [{ productId: 'product-2', name: 'Aqua', qty: 1, unitPrice: 5000, lineTotal: 5000 }],
  },
];

const customers = [
  {
    _id: 'customer-1',
    shopId: 'shop-1',
    phone: '+628111',
    createdAt: new Date('2026-06-02T01:00:00.000Z'),
  },
  {
    _id: 'customer-2',
    shopId: 'shop-1',
    phone: '+628222',
    createdAt: new Date('2026-06-01T01:00:00.000Z'),
  },
];

const kasbons = [
  {
    shopId: 'shop-1',
    status: 'open',
    amount: 15000,
    dueDate: new Date('2026-06-01T00:00:00.000Z'),
  },
];

function queryResult(data) {
  return {
    lean: vi.fn().mockResolvedValue(data),
  };
}

function inRange(value, range) {
  if (!range) {
    return true;
  }
  const at = new Date(value).getTime();
  return (!range.$gte || at >= range.$gte.getTime()) && (!range.$lt || at < range.$lt.getTime());
}

function matches(filter, doc) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') {
      return true;
    }
    if (key === 'committedAt') {
      return inRange(doc.committedAt, value);
    }
    if (typeof value === 'object' && value?.$exists != null) {
      return value.$exists ? doc[key] != null : doc[key] == null;
    }
    return String(doc[key]) === String(value);
  });
}

describe('analyticsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T05:00:00.000Z'));
    shopFindOneMock.mockResolvedValue(shop);
    transactionFindMock.mockImplementation((filter) =>
      queryResult(transactions.filter((txn) => matches(filter, txn))),
    );
    productFindMock.mockResolvedValue(products);
    productFindMock.mockImplementation(() => queryResult(products));
    customerFindMock.mockImplementation(() => queryResult(customers));
    kasbonFindMock.mockImplementation((filter) =>
      queryResult(kasbons.filter((kasbon) => matches(filter, kasbon))),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('resolves dashboard shops by normalized owner phone', async () => {
    await expect(getShopByOwnerPhone('628123')).resolves.toBe(shop);
    expect(shopFindOneMock).toHaveBeenCalledWith({ ownerPhone: '+628123' });
  });

  it('counts only committed sales in summary metrics', async () => {
    const summary = await getDashboardSummary(shop, {
      now: new Date('2026-06-02T05:00:00.000Z'),
    });

    expect(summary.omzet.value).toBe(10000);
    expect(summary.omzet.deltaPct).toBe(100);
    expect(summary.txnToday.count).toBe(1);
    expect(summary.piutang).toEqual({ value: 15000, overdueCount: 1 });
    expect(summary.loyalty).toEqual({ count: 2, newToday: 1 });
  });

  it('builds a seven-day sales trend from committed transactions only', async () => {
    const trend = await getSalesTrend(shop, {
      days: 2,
      now: new Date('2026-06-02T05:00:00.000Z'),
    });

    expect(trend).toEqual({
      labels: ['Sen', 'Sel'],
      values: [5000, 10000],
    });
  });

  it('returns top items from committed sales only', async () => {
    const items = await getTopItems(shop, { now: new Date('2026-06-02T05:00:00.000Z') });

    expect(items).toEqual([
      { name: 'Indomie', qty: 2, value: 10000 },
      { name: 'Aqua', qty: 1, value: 5000 },
    ]);
  });

  it('blocks monthly Excel export for free-tier shops', async () => {
    await expect(
      buildMonthlyExcelExport({ ...shop, tier: 'free' }, { month: '2026-06' }),
    ).resolves.toEqual({ ok: false, reason: 'premium_required' });
  });

  it('builds Excel-compatible export with committed rows only for premium shops', async () => {
    const result = await buildMonthlyExcelExport(shop, { month: '2026-06' });

    expect(result.ok).toBe(true);
    expect(result.filename).toBe('warungai-warung-sri-2026-06.xls');
    expect(result.contentType).toBe('application/vnd.ms-excel');
    expect(result.body).toContain('Indomie');
    expect(result.body).toContain('Aqua');
    expect(result.body).not.toContain('999999');
  });
});
