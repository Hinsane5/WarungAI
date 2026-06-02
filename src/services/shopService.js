import { randomUUID } from 'node:crypto';

import { Shop } from '../models/Shop.js';
import { normalizePhone } from '../utils/phone.js';

export function buildDefaultShopName(ownerName) {
  return ownerName ? `Warung ${ownerName}` : 'Warung Baru';
}

export function generateLoyaltyQrSlug() {
  return `warung-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function generateDashboardToken() {
  return `dash_${randomUUID().replaceAll('-', '')}`;
}

async function ensureDashboardToken(shop) {
  if (shop && !shop.dashboardToken) {
    shop.dashboardToken = generateDashboardToken();
    if (typeof shop.save === 'function') {
      await shop.save();
    }
  }
  return shop;
}

export async function findOrCreateByOwnerPhone({ ownerPhone, ownerName }) {
  const normalizedOwnerPhone = normalizePhone(ownerPhone);
  const existingShop = await Shop.findOne({ ownerPhone: normalizedOwnerPhone });

  if (existingShop) {
    return { shop: await ensureDashboardToken(existingShop), created: false };
  }

  try {
    const shop = await Shop.create({
      name: buildDefaultShopName(ownerName),
      ownerPhone: normalizedOwnerPhone,
      ownerName,
      loyaltyQrSlug: generateLoyaltyQrSlug(),
      dashboardToken: generateDashboardToken(),
    });

    return { shop, created: true };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const shop = await Shop.findOne({ ownerPhone: normalizedOwnerPhone });

    if (!shop) {
      throw error;
    }

    return { shop: await ensureDashboardToken(shop), created: false };
  }
}
