import { config } from '../config/index.js';
import { sendText } from '../messaging/whatsapp.js';
import { Customer } from '../models/Customer.js';
import { Shop } from '../models/Shop.js';
import { Transaction } from '../models/Transaction.js';
import { logger } from '../utils/logger.js';
import { normalizePhone } from '../utils/phone.js';

const RECENT_TRANSACTION_WINDOW_MS = 30 * 60 * 1000;

function loyaltyUrl(slug) {
  return new URL(`/loyalty/${slug}`, config.publicBaseUrl).toString();
}

function formatStampMessage({ shop, customer }) {
  const shopName = shop.name ?? 'WarungAI';
  const stamps = customer.loyalty?.stamps ?? 0;
  const points = customer.loyalty?.points ?? 0;

  return [
    `Nomor kamu sudah terdaftar di ${shopName}.`,
    `Stamp digital: ${stamps}. Poin: ${points}.`,
    'Nomor ini akan dipakai untuk info kasbon, stamp, dan pengingat belanja dari warung ini.',
  ].join('\n');
}

function plain(value) {
  return value?.toObject?.() ?? value;
}

function normalizeAlias(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function customerNameQuery(shopId, name) {
  const normalizedName = normalizeAlias(name);

  if (!normalizedName) {
    return null;
  }

  return {
    shopId,
    $and: [{ $or: [{ phone: { $exists: false } }, { phone: null }, { phone: '' }] }],
    $or: [
      { name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i') },
      { aliases: normalizedName },
    ],
  };
}

export async function resolveShopByLoyaltySlug(slug) {
  if (!slug) {
    return null;
  }

  return Shop.findOne({ loyaltyQrSlug: slug });
}

async function linkRecentTransaction({ shopId, customerId, now = new Date() }) {
  const since = new Date(now.getTime() - RECENT_TRANSACTION_WINDOW_MS);
  let query = Transaction.findOne({
    shopId,
    status: 'committed',
    $or: [{ customerId: { $exists: false } }, { customerId: null }],
    committedAt: { $gte: since },
  });

  if (typeof query.sort === 'function') {
    query = query.sort({ committedAt: -1, createdAt: -1 });
  }

  const transaction = query?.exec ? await query.exec() : await query;

  if (!transaction) {
    return null;
  }

  transaction.customerId = customerId;
  await transaction.save();
  return transaction;
}

export function buildLoyaltyQrUrl(shop) {
  return loyaltyUrl(shop.loyaltyQrSlug);
}

export async function registerLoyaltyCustomer({ slug, phone, name, now = new Date() }) {
  const shop = await resolveShopByLoyaltySlug(slug);

  if (!shop) {
    return { ok: false, reason: 'shop_not_found' };
  }

  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone || normalizedPhone.length < 8) {
    return { ok: false, reason: 'invalid_phone' };
  }

  let customer = await Customer.findOne({ shopId: shop._id, phone: normalizedPhone });

  if (!customer && name) {
    const nameQuery = customerNameQuery(shop._id, name);
    customer = nameQuery ? await Customer.findOne(nameQuery) : null;
  }

  if (!customer) {
    customer = await Customer.create({
      shopId: shop._id,
      phone: normalizedPhone,
      name,
      loyalty: {
        points: 1,
        stamps: 1,
        joinedVia: 'qr',
      },
      optInBroadcast: true,
    });
  } else {
    customer.phone = normalizedPhone;
    customer.name = name || customer.name;
    if (name) {
      const normalizedName = normalizeAlias(name);
      customer.aliases = [...new Set([...(customer.aliases ?? []), normalizedName])];
    }
    customer.optInBroadcast = true;
    customer.loyalty = {
      ...(plain(customer.loyalty) ?? {}),
      points: (customer.loyalty?.points ?? 0) + 1,
      stamps: (customer.loyalty?.stamps ?? 0) + 1,
      joinedVia: customer.loyalty?.joinedVia ?? 'qr',
    };
    await customer.save();
  }

  const linkedTransaction = await linkRecentTransaction({
    shopId: shop._id,
    customerId: customer._id,
    now,
  });

  try {
    await sendText(normalizedPhone, formatStampMessage({ shop, customer }));
  } catch (error) {
    logger.warn(
      {
        err: error,
        shopId: shop._id,
        customerId: customer._id,
        phone: normalizedPhone,
      },
      'Loyalty stamp confirmation send failed',
    );
  }

  return {
    ok: true,
    shop,
    customer,
    linkedTransaction,
    loyaltyUrl: loyaltyUrl(slug),
  };
}
