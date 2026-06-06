import { readFileSync } from 'node:fs';
import { z } from 'zod';

import {
  buildMonthlyExcelExport,
  createDashboardCustomer,
  getCategoryMix,
  getCreditScores,
  getDashboardSummary,
  getPredictiveRestock,
  getSalesTrend,
  getShopByDashboardToken,
  getTopItems,
  listDashboardCustomers,
} from '../services/analyticsService.js';
import {
  getActiveWarung,
  getRetailPriceTrend,
  getTopBrands,
  getTurnoverByItem,
} from '../services/bigqueryService.js';
import {
  createDashboardProduct,
  listDashboardProducts,
  updateDashboardProductPrices,
} from '../services/productService.js';
import { previewProactiveCrm } from '../services/crmPreviewService.js';
import { buildLoyaltyQr } from '../services/loyaltyService.js';
import { createPromo, listPromos } from '../services/promoService.js';

const landingHtml = readFileSync(
  new URL('../../web/dashboard/landing.html', import.meta.url),
  'utf8',
);
const dashboardHtml = readFileSync(
  new URL('../../web/dashboard/index.html', import.meta.url),
  'utf8',
);
const chatHtml = readFileSync(new URL('../../web/dashboard/chat.html', import.meta.url), 'utf8');
const b2bHtml = readFileSync(new URL('../../web/dashboard/b2b.html', import.meta.url), 'utf8');
const productsHtml = readFileSync(
  new URL('../../web/dashboard/products.html', import.meta.url),
  'utf8',
);
const customersHtml = readFileSync(
  new URL('../../web/dashboard/customers.html', import.meta.url),
  'utf8',
);

const b2bQuerySchema = z.object({
  region: z.string().trim().min(1).max(80).default('Tangerang'),
  productName: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).default(''),
  unit: z.string().trim().max(40).default('pcs'),
  stock: z.coerce.number().int().nonnegative().default(0),
  sellPrice: z.coerce.number().int().nonnegative().default(0),
  costPrice: z.coerce.number().int().nonnegative().default(0),
  reorderPoint: z.coerce.number().int().nonnegative().default(0),
});
const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).default(''),
  optInBroadcast: z.coerce.boolean().default(true),
});
const promoCreateSchema = z.object({
  brand: z.string().trim().min(1).max(120),
  distributor: z.string().trim().min(1).max(120),
  offer: z.string().trim().min(1).max(200),
  region: z.string().trim().max(80).default('all'),
  commissionPct: z.coerce.number().min(0).max(100).default(5),
  activeUntil: z.string().trim().optional(),
});
const productPriceUpdateSchema = z
  .object({
    sellPrice: z.coerce.number().int().nonnegative().optional(),
    costPrice: z.coerce.number().int().nonnegative().optional(),
  })
  .refine((data) => data.sellPrice != null || data.costPrice != null, {
    message: 'at least one price is required',
  });

async function resolveDashboardShop(req, res) {
  const token = req.query.token;

  if (!token) {
    res.status(401).json({ ok: false, error: 'dashboard_token_required' });
    return null;
  }

  const shop = await getShopByDashboardToken(token);

  if (!shop) {
    res.status(404).json({ ok: false, error: 'shop_not_found' });
    return null;
  }

  return shop;
}

function handleDashboardError(req, res, error) {
  req.log?.error({ err: error }, 'Dashboard request failed');
  return res.status(500).json({ ok: false, error: 'dashboard_failed' });
}

function handleB2bError(req, res, error, fallback) {
  req.log?.warn({ err: error }, 'B2B BigQuery request failed; returning empty dashboard data');
  return res.status(200).json(fallback);
}

function parseB2bQuery(req, res) {
  const result = b2bQuerySchema.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({ ok: false, error: 'invalid_query' });
    return null;
  }

  return result.data;
}

function asNumber(value) {
  const raw = value?.value ?? value;
  const number = Number(raw ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function asDateLabel(value) {
  return String(value?.value ?? value ?? '');
}

function avgTurnoverDays(rows) {
  if (rows.length === 0) {
    return 0;
  }

  const total = rows.reduce((sum, row) => sum + asNumber(row.daysPerUnit), 0);
  return Math.round((total / rows.length) * 10) / 10;
}

export function renderLanding(_req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).type('html').send(landingHtml);
}

export function renderDashboard(_req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).type('html').send(dashboardHtml);
}

export function renderDashboardChat(_req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).type('html').send(chatHtml);
}

export function renderDashboardB2b(_req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).type('html').send(b2bHtml);
}

export function renderDashboardProducts(_req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).type('html').send(productsHtml);
}

export function renderDashboardCustomers(_req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).type('html').send(customersHtml);
}

export async function dashboardSummary(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await getDashboardSummary(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardCrmPreview(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await previewProactiveCrm(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardLoyaltyQr(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await buildLoyaltyQr(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardPromos(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await listPromos());
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardCreatePromo(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;

    const parsed = promoCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'invalid_promo' });
    }

    return res.status(200).json(await createPromo(parsed.data));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardB2bSummary(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    const query = parseB2bQuery(req, res);
    if (!query) return null;

    let activeWarung;
    let turnover;
    try {
      [activeWarung, turnover] = await Promise.all([
        getActiveWarung({ region: query.region }),
        getTurnoverByItem({ region: query.region }),
      ]);
    } catch (error) {
      return handleB2bError(req, res, error, {
        activeWarung: 0,
        avgTurnoverDays: 0,
        region: query.region,
      });
    }

    return res.status(200).json({
      activeWarung: asNumber(activeWarung),
      avgTurnoverDays: avgTurnoverDays(turnover),
      region: query.region,
    });
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardB2bTopBrands(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    const query = parseB2bQuery(req, res);
    if (!query) return null;

    let rows;
    try {
      rows = await getTopBrands({ region: query.region, limit: query.limit });
    } catch (error) {
      return handleB2bError(req, res, error, []);
    }
    return res.status(200).json(
      rows.map((row) => ({
        productName: row.productName,
        volume: asNumber(row.volume),
        revenue: asNumber(row.revenue),
      })),
    );
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardB2bTurnover(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    const query = parseB2bQuery(req, res);
    if (!query) return null;

    let rows;
    try {
      rows = await getTurnoverByItem({ region: query.region });
    } catch (error) {
      return handleB2bError(req, res, error, []);
    }
    return res.status(200).json(
      rows.map((row) => ({
        productName: row.productName,
        unitsSold: asNumber(row.unitsSold),
        activeDays: asNumber(row.activeDays),
        daysPerUnit: Math.round(asNumber(row.daysPerUnit) * 10) / 10,
      })),
    );
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardB2bPriceTrend(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    const query = parseB2bQuery(req, res);
    if (!query) return null;

    let rows;
    try {
      rows = await getRetailPriceTrend({
        region: query.region,
        productName: query.productName,
      });
    } catch (error) {
      return handleB2bError(req, res, error, []);
    }
    return res.status(200).json(
      rows.map((row) => ({
        week: asDateLabel(row.week),
        productName: row.productName,
        avgPrice: asNumber(row.avgPrice),
      })),
    );
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardProducts(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await listDashboardProducts(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardCreateProduct(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;

    const parsed = productCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'invalid_product' });
    }

    const result = await createDashboardProduct(shop, parsed.data);
    if (!result.ok && result.reason === 'duplicate_product') {
      return res.status(409).json({ ok: false, error: 'duplicate_product' });
    }

    return res.status(200).json(result);
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardUpdateProduct(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;

    const parsed = productPriceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'invalid_price' });
    }

    const product = await updateDashboardProductPrices(shop, req.params.id, parsed.data);
    if (!product) {
      return res.status(404).json({ ok: false, error: 'product_not_found' });
    }

    return res.status(200).json({ ok: true, product });
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardCustomers(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await listDashboardCustomers(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardCreateCustomer(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;

    const parsed = customerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'invalid_customer' });
    }

    const result = await createDashboardCustomer(shop, parsed.data);
    if (!result.ok && result.reason === 'duplicate_customer') {
      return res.status(409).json({ ok: false, error: 'duplicate_customer' });
    }

    return res.status(200).json(result);
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardSalesTrend(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await getSalesTrend(shop, { days: req.query.days }));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardCategoryMix(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await getCategoryMix(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardTopItems(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await getTopItems(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardPredictiveRestock(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await getPredictiveRestock(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardCreditScores(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await getCreditScores(shop));
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}

export async function dashboardExport(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    const result = await buildMonthlyExcelExport(shop, { month: req.query.month });

    if (!result.ok && result.reason === 'premium_required') {
      return res.status(403).json({ ok: false, error: 'premium_required' });
    }

    res.set('Content-Type', result.contentType);
    res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.body);
  } catch (error) {
    return handleDashboardError(req, res, error);
  }
}
