import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getShopByDashboardTokenMock = vi.hoisted(() => vi.fn());
const getDashboardSummaryMock = vi.hoisted(() => vi.fn());
const getSalesTrendMock = vi.hoisted(() => vi.fn());
const getCategoryMixMock = vi.hoisted(() => vi.fn());
const getTopItemsMock = vi.hoisted(() => vi.fn());
const getPredictiveRestockMock = vi.hoisted(() => vi.fn());
const getCreditScoresMock = vi.hoisted(() => vi.fn());
const buildMonthlyExcelExportMock = vi.hoisted(() => vi.fn());
const getActiveWarungMock = vi.hoisted(() => vi.fn());
const getTopBrandsMock = vi.hoisted(() => vi.fn());
const getTurnoverByItemMock = vi.hoisted(() => vi.fn());
const getRetailPriceTrendMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/analyticsService.js', () => ({
  getShopByDashboardToken: getShopByDashboardTokenMock,
  getDashboardSummary: getDashboardSummaryMock,
  getSalesTrend: getSalesTrendMock,
  getCategoryMix: getCategoryMixMock,
  getTopItems: getTopItemsMock,
  getPredictiveRestock: getPredictiveRestockMock,
  getCreditScores: getCreditScoresMock,
  buildMonthlyExcelExport: buildMonthlyExcelExportMock,
}));

vi.mock('../src/services/bigqueryService.js', () => ({
  getActiveWarung: getActiveWarungMock,
  getTopBrands: getTopBrandsMock,
  getTurnoverByItem: getTurnoverByItemMock,
  getRetailPriceTrend: getRetailPriceTrendMock,
}));

const { app } = await import('../src/app.js');

const shop = { _id: 'shop-1', name: 'Warung Sri', tier: 'premium' };

describe('dashboard routes', () => {
  beforeEach(() => {
    getShopByDashboardTokenMock.mockResolvedValue(shop);
    getDashboardSummaryMock.mockResolvedValue({ omzet: { value: 10000 } });
    getSalesTrendMock.mockResolvedValue({ labels: ['Sen'], values: [10000] });
    getCategoryMixMock.mockResolvedValue([{ category: 'Makanan', value: 10000 }]);
    getTopItemsMock.mockResolvedValue([{ name: 'Indomie', qty: 2, value: 10000 }]);
    getPredictiveRestockMock.mockResolvedValue([]);
    getCreditScoresMock.mockResolvedValue([]);
    buildMonthlyExcelExportMock.mockResolvedValue({
      ok: true,
      filename: 'report.xls',
      contentType: 'application/vnd.ms-excel',
      body: '<Workbook />',
    });
    getActiveWarungMock.mockResolvedValue({ value: '1245' });
    getTopBrandsMock.mockResolvedValue([
      {
        productName: 'Indomie Goreng',
        volume: { value: '45000' },
        revenue: { value: '135000000' },
      },
    ]);
    getTurnoverByItemMock.mockResolvedValue([
      {
        productName: 'Indomie Goreng',
        unitsSold: { value: '45000' },
        activeDays: { value: '54' },
        daysPerUnit: { value: '1.2' },
      },
      {
        productName: 'Aqua Galon',
        unitsSold: { value: '1000' },
        activeDays: { value: '20' },
        daysPerUnit: { value: '2.3' },
      },
    ]);
    getRetailPriceTrendMock.mockResolvedValue([
      {
        week: { value: '2026-05-25' },
        productName: 'Minyak Goreng 1L',
        avgPrice: { value: '16000' },
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard page', async () => {
    const response = await request(app).get('/dashboard').expect(200);

    expect(response.text).toContain('WarungAI Dashboard');
    expect(response.text).toContain('/dashboard/js/app.js');
    expect(response.text).toContain('/dashboard/chat');
    expect(response.text).toContain('/dashboard/b2b');
  });

  it('renders the dashboard chat page', async () => {
    const response = await request(app).get('/dashboard/chat').expect(200);

    expect(response.text).toContain('WarungAI Chat Bot');
    expect(response.text).toContain('/dashboard/js/chat.js');
  });

  it('renders the B2B data page', async () => {
    const response = await request(app).get('/dashboard/b2b').expect(200);

    expect(response.text).toContain('WarungAI B2B Data');
    expect(response.text).toContain('/dashboard/js/b2b.js');
  });

  it('requires a dashboard token for dashboard API requests', async () => {
    await request(app).get('/api/dashboard/summary').expect(401, {
      ok: false,
      error: 'dashboard_token_required',
    });
  });

  it('does not authorize dashboard data with only an owner phone', async () => {
    await request(app).get('/api/dashboard/summary').query({ ownerPhone: '+628123' }).expect(401, {
      ok: false,
      error: 'dashboard_token_required',
    });
  });

  it('returns summary JSON for an authorized token link', async () => {
    await request(app)
      .get('/api/dashboard/summary')
      .query({ token: 'dash-test' })
      .expect(200, { omzet: { value: 10000 } });

    expect(getShopByDashboardTokenMock).toHaveBeenCalledWith('dash-test');
    expect(getDashboardSummaryMock).toHaveBeenCalledWith(shop);
  });

  it('requires a dashboard token for B2B API requests', async () => {
    await request(app).get('/api/dashboard/b2b/summary').expect(401, {
      ok: false,
      error: 'dashboard_token_required',
    });
  });

  it('returns B2B summary from BigQuery data', async () => {
    await request(app)
      .get('/api/dashboard/b2b/summary')
      .query({ token: 'dash-test', region: 'Tangerang' })
      .expect(200, {
        activeWarung: 1245,
        avgTurnoverDays: 1.8,
        region: 'Tangerang',
      });

    expect(getActiveWarungMock).toHaveBeenCalledWith({ region: 'Tangerang' });
    expect(getTurnoverByItemMock).toHaveBeenCalledWith({ region: 'Tangerang' });
  });

  it('returns B2B top brands, turnover, and price trend data', async () => {
    await request(app)
      .get('/api/dashboard/b2b/top-brands')
      .query({ token: 'dash-test', region: 'Tangerang', limit: 3 })
      .expect(200, [{ productName: 'Indomie Goreng', volume: 45000, revenue: 135000000 }]);

    await request(app)
      .get('/api/dashboard/b2b/turnover')
      .query({ token: 'dash-test', region: 'Tangerang' })
      .expect(200, [
        { productName: 'Indomie Goreng', unitsSold: 45000, activeDays: 54, daysPerUnit: 1.2 },
        { productName: 'Aqua Galon', unitsSold: 1000, activeDays: 20, daysPerUnit: 2.3 },
      ]);

    await request(app)
      .get('/api/dashboard/b2b/price-trend')
      .query({ token: 'dash-test', region: 'Tangerang', productName: 'Minyak Goreng 1L' })
      .expect(200, [{ week: '2026-05-25', productName: 'Minyak Goreng 1L', avgPrice: 16000 }]);
  });

  it('returns empty B2B data when BigQuery has no rows', async () => {
    getActiveWarungMock.mockResolvedValueOnce(0);
    getTurnoverByItemMock.mockResolvedValue([]);
    getTopBrandsMock.mockResolvedValue([]);

    await request(app)
      .get('/api/dashboard/b2b/summary')
      .query({ token: 'dash-test', region: 'Tangerang' })
      .expect(200, {
        activeWarung: 0,
        avgTurnoverDays: 0,
        region: 'Tangerang',
      });

    await request(app)
      .get('/api/dashboard/b2b/top-brands')
      .query({ token: 'dash-test', region: 'Tangerang' })
      .expect(200, []);
  });

  it('serves premium Excel export', async () => {
    const response = await request(app)
      .get('/api/dashboard/export')
      .query({ token: 'dash-test', month: '2026-06' })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/vnd.ms-excel');
    expect(response.headers['content-disposition']).toContain('report.xls');
    expect(response.text).toBe('<Workbook />');
    expect(buildMonthlyExcelExportMock).toHaveBeenCalledWith(shop, { month: '2026-06' });
  });

  it('blocks free-tier export responses', async () => {
    buildMonthlyExcelExportMock.mockResolvedValueOnce({
      ok: false,
      reason: 'premium_required',
    });

    await request(app)
      .get('/api/dashboard/export')
      .query({ token: 'dash-test', month: '2026-06' })
      .expect(403, { ok: false, error: 'premium_required' });
  });
});
