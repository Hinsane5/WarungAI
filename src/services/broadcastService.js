import { config } from '../config/index.js';
import { sendText } from '../messaging/whatsapp.js';
import { logger } from '../utils/logger.js';

function plainQuotas(shop) {
  return shop.quotas?.toObject?.() ?? shop.quotas ?? {};
}

// Owner-facing alerts (low stock, "out of credits") are NOT metered.
export async function notifyOwner(shop, text) {
  try {
    await sendText(shop.ownerPhone, text);
    return { sent: true };
  } catch (error) {
    logger.warn({ err: error, shopId: shop._id }, 'Owner notification send failed');
    return { sent: false, reason: 'send_failed' };
  }
}

// Customer broadcasts (restock reminders, promos) are metered by the Koin Bot quota
// and require opt-in. Returns a structured result; never throws on a send failure.
export async function sendCustomerBroadcast({ shop, customer, text }) {
  if (!customer.phone) {
    return { sent: false, reason: 'no_phone' };
  }

  if (customer.optInBroadcast === false) {
    return { sent: false, reason: 'opted_out' };
  }

  if (config.limits.koinBotEnabled && (shop.quotas?.koinBotBalance ?? 0) <= 0) {
    return { sent: false, reason: 'quota_exhausted' };
  }

  try {
    await sendText(customer.phone, text);
  } catch (error) {
    logger.warn(
      { err: error, shopId: shop._id, customerId: customer._id },
      'Customer broadcast send failed',
    );
    return { sent: false, reason: 'send_failed' };
  }

  if (config.limits.koinBotEnabled) {
    shop.quotas = {
      ...plainQuotas(shop),
      koinBotBalance: (shop.quotas?.koinBotBalance ?? 0) - 1,
    };
    await shop.save();
  }

  return { sent: true };
}
