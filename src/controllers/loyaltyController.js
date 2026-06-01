import { readFileSync } from 'node:fs';

import {
  buildLoyaltyQrUrl,
  registerLoyaltyCustomer,
  resolveShopByLoyaltySlug,
} from '../services/loyaltyService.js';

const pageTemplate = readFileSync(new URL('../../web/loyalty/index.html', import.meta.url), 'utf8');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function renderLoyaltyPage(req, res) {
  try {
    const shop = await resolveShopByLoyaltySlug(req.params.slug);

    if (!shop) {
      return res.status(404).send('Loyalty page not found');
    }

    const html = pageTemplate
      .replaceAll('{{SHOP_NAME}}', escapeHtml(shop.name))
      .replaceAll('{{SLUG}}', escapeHtml(shop.loyaltyQrSlug))
      .replaceAll('{{LOYALTY_URL}}', escapeHtml(buildLoyaltyQrUrl(shop)));

    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).type('html').send(html);
  } catch (error) {
    req.log?.error({ err: error }, 'Loyalty page render failed');
    return res.status(500).send('Loyalty page unavailable');
  }
}

export async function registerLoyalty(req, res) {
  try {
    const result = await registerLoyaltyCustomer({
      slug: req.body?.slug,
      phone: req.body?.phone,
      name: req.body?.name,
    });

    if (!result.ok && result.reason === 'shop_not_found') {
      return res.status(404).json({ ok: false, error: 'shop_not_found' });
    }

    if (!result.ok && result.reason === 'invalid_phone') {
      return res.status(400).json({ ok: false, error: 'invalid_phone' });
    }

    return res.status(200).json({
      ok: true,
      shopName: result.shop.name,
      stamps: result.customer.loyalty?.stamps ?? 0,
      points: result.customer.loyalty?.points ?? 0,
    });
  } catch (error) {
    req.log?.error({ err: error }, 'Loyalty registration failed');
    return res.status(500).json({ ok: false, error: 'registration_failed' });
  }
}
