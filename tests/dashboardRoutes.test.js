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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard page', async () => {
    const response = await request(app).get('/dashboard').expect(200);

    expect(response.text).toContain('WarungAI Dashboard');
    expect(response.text).toContain('/dashboard/js/app.js');
    expect(response.text).toContain('/dashboard/chat');
  });

  it('renders the dashboard chat page', async () => {
    const response = await request(app).get('/dashboard/chat').expect(200);

    expect(response.text).toContain('WarungAI Chat Bot');
    expect(response.text).toContain('/dashboard/js/chat.js');
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
