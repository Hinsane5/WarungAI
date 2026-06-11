import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendTextMock = vi.hoisted(() => vi.fn());
const getProfitMock = vi.hoisted(() => vi.fn());
const getPredictiveRestockMock = vi.hoisted(() => vi.fn());
const getCreditScoresMock = vi.hoisted(() => vi.fn());
const previewProactiveCrmMock = vi.hoisted(() => vi.fn());
const resolveProductMock = vi.hoisted(() => vi.fn());
const listDashboardProductsMock = vi.hoisted(() => vi.fn());
const askWarungAssistantMock = vi.hoisted(() => vi.fn());

vi.mock('../src/messaging/whatsapp.js', () => ({ sendText: sendTextMock }));
vi.mock('../src/ai/assistant.js', () => ({ askWarungAssistant: askWarungAssistantMock }));
vi.mock('../src/services/analyticsService.js', () => ({
  getProfit: getProfitMock,
  getPredictiveRestock: getPredictiveRestockMock,
  getCreditScores: getCreditScoresMock,
}));
vi.mock('../src/services/crmPreviewService.js', () => ({
  previewProactiveCrm: previewProactiveCrmMock,
}));
vi.mock('../src/services/productService.js', () => ({
  resolveProduct: resolveProductMock,
  listDashboardProducts: listDashboardProductsMock,
}));

const { classifyQuery, isAnsweredQuery, handleQuery } = await import(
  '../src/services/queryService.js'
);

const shop = { _id: 'shop-1' };
const from = '+6281234567890';

beforeEach(() => {
  sendTextMock.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe('classifyQuery', () => {
  it.each([
    ['berapa untung hari ini', 'profit', 'today'],
    ['laba bersih bulan ini', 'profit', 'month'],
    ['net profit bulanan', 'profit', 'month'],
  ])('classifies "%s" as %s/%s', (text, type, period) => {
    expect(classifyQuery(text)).toEqual({ type, period });
  });

  it.each([
    ['barang apa yang harus direstok', 'restock'],
    ['ada yang menipis ga', 'restock'],
    ['omzet hari ini berapa', 'sales'],
    ['total kasbon semua berapa', 'kasbon'],
    ['sisa stok indomie berapa', 'stock'],
    ['indomie masih ada?', 'stock'],
    ['liat semua produk yang saya jual', 'product_list'],
    ['daftar barang di warung', 'product_list'],
    ['tampilkan katalog', 'product_list'],
    ['produk apa saja yang saya jual', 'product_list'],
  ])('classifies "%s" as %s', (text, type) => {
    expect(classifyQuery(text).type).toBe(type);
  });

  it('falls back to general for non-data questions', () => {
    expect(classifyQuery('gimana cara catat penjualan').type).toBe('general');
    expect(isAnsweredQuery('gimana cara catat penjualan')).toBe(false);
    expect(isAnsweredQuery('untung hari ini')).toBe(true);
  });
});

describe('handleQuery', () => {
  it('answers net profit deterministically', async () => {
    getProfitMock.mockResolvedValue({ profit: 9000, revenue: 21000, cost: 12000, hasUnknownCost: false });
    const result = await handleQuery({ shop, message: { from, text: 'untung hari ini' } });
    expect(getProfitMock).toHaveBeenCalledWith(shop, { period: 'today' });
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringContaining('Laba bersih'));
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringMatching(/9\.000/u));
    expect(result.action).toBe('query_profit');
  });

  it('lists items that need restock', async () => {
    getPredictiveRestockMock.mockResolvedValue([
      { name: 'Indomie', remaining: 2, unit: 'dus', daysToStockout: 1 },
    ]);
    const result = await handleQuery({ shop, message: { from, text: 'apa yang perlu direstok' } });
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringContaining('Indomie'));
    expect(result.action).toBe('query_restock');
  });

  it('reports a product stock level', async () => {
    resolveProductMock.mockResolvedValue({
      product: { name: 'Indomie Goreng', stock: 12, unit: 'dus', reorderPoint: 5 },
    });
    const result = await handleQuery({ shop, message: { from, text: 'sisa stok indomie' } });
    expect(resolveProductMock).toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringContaining('12'));
    expect(result.action).toBe('query_stock');
  });

  it('lists all products in the catalog', async () => {
    listDashboardProductsMock.mockResolvedValue([
      { name: 'Indomie Goreng', stock: 12, unit: 'dus', sellPrice: 3000, lowStock: false },
      { name: 'Aqua Galon', stock: 2, unit: 'galon', sellPrice: 20000, lowStock: true },
    ]);
    const result = await handleQuery({ shop, message: { from, text: 'liat semua produk' } });
    expect(listDashboardProductsMock).toHaveBeenCalledWith(shop);
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringContaining('Daftar Produk'));
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringContaining('Indomie Goreng'));
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringContaining('Aqua Galon'));
    expect(result.action).toBe('query_product_list');
  });

  it('totals outstanding kasbon', async () => {
    getCreditScoresMock.mockResolvedValue([
      { name: 'Budi', debt: 50000 },
      { name: 'Andi', debt: 20000 },
    ]);
    const result = await handleQuery({ shop, message: { from, text: 'total kasbon berapa' } });
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringContaining('Total Kasbon'));
    expect(sendTextMock).toHaveBeenCalledWith(from, expect.stringMatching(/70\.000/u));
    expect(result.action).toBe('query_kasbon');
  });

  it('uses the Gemini assistant for general questions', async () => {
    askWarungAssistantMock.mockResolvedValue('Untuk catat penjualan, ketik "laku 2 indomie".');
    const result = await handleQuery({ shop, message: { from, text: 'gimana cara jualan' } });
    expect(askWarungAssistantMock).toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledWith(from, 'Untuk catat penjualan, ketik "laku 2 indomie".');
    expect(result.action).toBe('query_general');
  });

  it('never sends an empty reply when the assistant is unavailable', async () => {
    askWarungAssistantMock.mockResolvedValue(null);
    await handleQuery({ shop, message: { from, text: 'halo apa kabar' } });
    const [, body] = sendTextMock.mock.calls.at(-1);
    expect(typeof body).toBe('string');
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('/bantuan');
  });
});
