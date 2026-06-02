import { readFileSync } from 'node:fs';

import {
  buildMonthlyExcelExport,
  getCategoryMix,
  getCreditScores,
  getDashboardSummary,
  getPredictiveRestock,
  getSalesTrend,
  getShopByDashboardToken,
  getTopItems,
} from '../services/analyticsService.js';

const dashboardHtml = readFileSync(
  new URL('../../web/dashboard/index.html', import.meta.url),
  'utf8',
);
const chatHtml = readFileSync(new URL('../../web/dashboard/chat.html', import.meta.url), 'utf8');

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

export function renderDashboard(_req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).type('html').send(dashboardHtml);
}

export function renderDashboardChat(_req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).type('html').send(chatHtml);
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
