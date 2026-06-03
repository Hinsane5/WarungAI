import { readFileSync } from 'node:fs';
import { z } from 'zod';

import {
  buildMonthlyExcelExport,
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
import { createDashboardProduct, listDashboardProducts } from '../services/productService.js';

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

export async function dashboardCustomers(req, res) {
  try {
    const shop = await resolveDashboardShop(req, res);
    if (!shop) return null;
    return res.status(200).json(await listDashboardCustomers(shop));
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
