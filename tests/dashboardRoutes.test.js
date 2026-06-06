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
const listDashboardProductsMock = vi.hoisted(() => vi.fn());
const createDashboardProductMock = vi.hoisted(() => vi.fn());
const updateDashboardProductPricesMock = vi.hoisted(() => vi.fn());
const listDashboardCustomersMock = vi.hoisted(() => vi.fn());
const createDashboardCustomerMock = vi.hoisted(() => vi.fn());
const previewProactiveCrmMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/analyticsService.js', () => ({
  getShopByDashboardToken: getShopByDashboardTokenMock,
  getDashboardSummary: getDashboardSummaryMock,
  getSalesTrend: getSalesTrendMock,
  getCategoryMix: getCategoryMixMock,
  getTopItems: getTopItemsMock,
  getPredictiveRestock: getPredictiveRestockMock,
  getCreditScores: getCreditScoresMock,
  buildMonthlyExcelExport: buildMonthlyExcelExportMock,
  listDashboardCustomers: listDashboardCustomersMock,
  createDashboardCustomer: createDashboardCustomerMock,
}));

vi.mock('../src/services/bigqueryService.js', () => ({
  getActiveWarung: getActiveWarungMock,
  getTopBrands: getTopBrandsMock,
  getTurnoverByItem: getTurnoverByItemMock,
  getRetailPriceTrend: getRetailPriceTrendMock,
}));

vi.mock('../src/services/productService.js', () => ({
  listDashboardProducts: listDashboardProductsMock,
  createDashboardProduct: createDashboardProductMock,
  updateDashboardProductPrices: updateDashboardProductPricesMock,
}));

vi.mock('../src/services/crmPreviewService.js', () => ({
  previewProactiveCrm: previewProactiveCrmMock,
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
    listDashboardProductsMock.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Indomie Goreng',
        category: 'Makanan',
        unit: 'pcs',
        stock: 12,
        sellPrice: 3000,
        costPrice: 2500,
        reorderPoint: 5,
        lowStock: false,
      },
    ]);
    createDashboardProductMock.mockResolvedValue({ ok: true, id: 'product-2' });
    listDashboardCustomersMock.mockResolvedValue([
      {
        id: 'customer-1',
        name: 'Sari',
        phone: '+628111',
        points: 7,
        stamps: 7,
        segment: 'champion',
        outstandingKasbon: 0,
        creditBand: 'good',
        creditScore: 100,
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the role-select landing page at root', async () => {
    const response = await request(app).get('/').expect(200);

    expect(response.text).toContain('Pilih Akses');
    expect(response.text).toContain('Distributor / Principal FMCG');
    expect(response.text).toContain('Pemilik Warung');
  });

  it('renders the dashboard page', async () => {
    const response = await request(app).get('/dashboard').expect(200);

    expect(response.text).toContain('WarungAI Dashboard');
    expect(response.text).toContain('/dashboard/js/app.js');
    expect(response.text).toContain('/dashboard/chat');
    expect(response.text).toContain('/dashboard/products');
    expect(response.text).toContain('/dashboard/customers');
    // B2B is a separate partner audience now — it must NOT appear in the owner navbar.
    expect(response.text).not.toContain('/dashboard/b2b');
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

  it('renders the products page', async () => {
    const response = await request(app).get('/dashboard/products').expect(200);

    expect(response.text).toContain('WarungAI Produk');
    expect(response.text).toContain('/dashboard/js/products.js');
  });

  it('renders the customers page', async () => {
    const response = await request(app).get('/dashboard/customers').expect(200);

    expect(response.text).toContain('WarungAI Pelanggan');
    expect(response.text).toContain('/dashboard/js/customers.js');
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

  it('returns empty B2B data when BigQuery fails', async () => {
    getActiveWarungMock.mockRejectedValueOnce(new Error('adc missing'));

    await request(app)
      .get('/api/dashboard/b2b/summary')
      .query({ token: 'dash-test', region: 'Tangerang' })
      .expect(200, {
        activeWarung: 0,
        avgTurnoverDays: 0,
        region: 'Tangerang',
      });

    getTopBrandsMock.mockRejectedValueOnce(new Error('adc missing'));
    await request(app)
      .get('/api/dashboard/b2b/top-brands')
      .query({ token: 'dash-test', region: 'Tangerang' })
      .expect(200, []);
  });

  it('requires a dashboard token for product API requests', async () => {
    await request(app).get('/api/dashboard/products').expect(401, {
      ok: false,
      error: 'dashboard_token_required',
    });
  });

  it('returns the proactive CRM preview for the token shop', async () => {
    const preview = {
      mode: 'preview',
      summary: {
        customersSegmented: 2,
        ownerAlerts: 1,
        customerReminders: 1,
        koinBotBalance: 50,
        koinBotNeeded: 1,
      },
      ownerAlert: { to: '+62811', message: 'Pengingat stok dari WarungAI:' },
      customerReminders: [
        { name: 'Budi', phone: '+62812', segment: 'loyal', productName: 'Aqua', message: 'Halo!' },
      ],
      segments: [{ name: 'Budi', phone: '+62812', segment: 'loyal' }],
    };
    previewProactiveCrmMock.mockResolvedValue(preview);

    await request(app)
      .get('/api/dashboard/crm/preview')
      .query({ token: 'dash-test' })
      .expect(200, preview);

    expect(previewProactiveCrmMock).toHaveBeenCalledWith(shop);
  });

  it('requires a dashboard token for the CRM preview', async () => {
    await request(app).get('/api/dashboard/crm/preview').expect(401, {
      ok: false,
      error: 'dashboard_token_required',
    });
  });

  it('lists dashboard products for the token shop', async () => {
    await request(app)
      .get('/api/dashboard/products')
      .query({ token: 'dash-test' })
      .expect(200, [
        {
          id: 'product-1',
          name: 'Indomie Goreng',
          category: 'Makanan',
          unit: 'pcs',
          stock: 12,
          sellPrice: 3000,
          costPrice: 2500,
          reorderPoint: 5,
          lowStock: false,
        },
      ]);

    expect(listDashboardProductsMock).toHaveBeenCalledWith(shop);
  });

  it('creates dashboard products for the token shop', async () => {
    const payload = {
      name: 'Milo 3in1',
      category: 'Minuman',
      unit: 'sachet',
      stock: 40,
      sellPrice: 2000,
      costPrice: 1600,
      reorderPoint: 10,
    };

    await request(app)
      .post('/api/dashboard/products')
      .query({ token: 'dash-test' })
      .send(payload)
      .expect(200, { ok: true, id: 'product-2' });

    expect(createDashboardProductMock).toHaveBeenCalledWith(shop, payload);
  });

  it('updates a product price for the token shop', async () => {
    const updated = {
      id: 'product-1',
      name: 'Aqua Galon 19L',
      sellPrice: 25000,
      costPrice: 17000,
    };
    updateDashboardProductPricesMock.mockResolvedValue(updated);

    await request(app)
      .patch('/api/dashboard/products/product-1')
      .query({ token: 'dash-test' })
      .send({ sellPrice: 25000 })
      .expect(200, { ok: true, product: updated });

    expect(updateDashboardProductPricesMock).toHaveBeenCalledWith(shop, 'product-1', {
      sellPrice: 25000,
    });
  });

  it('returns 404 when updating an unknown product', async () => {
    updateDashboardProductPricesMock.mockResolvedValue(null);

    await request(app)
      .patch('/api/dashboard/products/nope')
      .query({ token: 'dash-test' })
      .send({ sellPrice: 25000 })
      .expect(404, { ok: false, error: 'product_not_found' });
  });

  it('rejects a price update with no fields', async () => {
    await request(app)
      .patch('/api/dashboard/products/product-1')
      .query({ token: 'dash-test' })
      .send({})
      .expect(400, { ok: false, error: 'invalid_price' });
  });

  it('rejects invalid product payloads', async () => {
    await request(app)
      .post('/api/dashboard/products')
      .query({ token: 'dash-test' })
      .send({ name: '', stock: -1 })
      .expect(400, { ok: false, error: 'invalid_product' });
  });

  it('returns 409 for duplicate product names', async () => {
    createDashboardProductMock.mockResolvedValueOnce({
      ok: false,
      reason: 'duplicate_product',
    });

    await request(app)
      .post('/api/dashboard/products')
      .query({ token: 'dash-test' })
      .send({ name: 'Indomie Goreng', stock: 1 })
      .expect(409, { ok: false, error: 'duplicate_product' });
  });

  it('requires a dashboard token for customer API requests', async () => {
    await request(app).get('/api/dashboard/customers').expect(401, {
      ok: false,
      error: 'dashboard_token_required',
    });
  });

  it('lists dashboard customers for the token shop', async () => {
    await request(app)
      .get('/api/dashboard/customers')
      .query({ token: 'dash-test' })
      .expect(200, [
        {
          id: 'customer-1',
          name: 'Sari',
          phone: '+628111',
          points: 7,
          stamps: 7,
          segment: 'champion',
          outstandingKasbon: 0,
          creditBand: 'good',
          creditScore: 100,
        },
      ]);

    expect(listDashboardCustomersMock).toHaveBeenCalledWith(shop);
  });

  it('creates a customer for the token shop', async () => {
    createDashboardCustomerMock.mockResolvedValue({ ok: true, id: 'customer-9' });

    await request(app)
      .post('/api/dashboard/customers')
      .query({ token: 'dash-test' })
      .send({ name: 'Budi', phone: '+62812', optInBroadcast: true })
      .expect(200, { ok: true, id: 'customer-9' });

    expect(createDashboardCustomerMock).toHaveBeenCalledWith(shop, {
      name: 'Budi',
      phone: '+62812',
      optInBroadcast: true,
    });
  });

  it('returns 409 on a duplicate customer phone', async () => {
    createDashboardCustomerMock.mockResolvedValue({ ok: false, reason: 'duplicate_customer' });

    await request(app)
      .post('/api/dashboard/customers')
      .query({ token: 'dash-test' })
      .send({ name: 'Budi', phone: '+62812' })
      .expect(409, { ok: false, error: 'duplicate_customer' });
  });

  it('rejects a customer with no name', async () => {
    await request(app)
      .post('/api/dashboard/customers')
      .query({ token: 'dash-test' })
      .send({ phone: '+62812' })
      .expect(400, { ok: false, error: 'invalid_customer' });
  });

  it('returns a scannable loyalty QR for the token shop', async () => {
    const res = await request(app)
      .get('/api/dashboard/loyalty-qr')
      .query({ token: 'dash-test' })
      .expect(200);

    expect(res.body.qr).toMatch(/^data:image\/png;base64,/);
    expect(res.body.url).toContain('/loyalty/');
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
