import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { notifyOwner, sendCustomerBroadcast } from '../services/broadcastService.js';
import {
  computeRfmForCustomer,
  isRestockReminderDue,
  promoForSegment,
} from '../services/crmService.js';
import { logger } from '../utils/logger.js';

function plain(value) {
  return value?.toObject?.() ?? value;
}

function restockMessage({ shop, product, segment }) {
  const shopName = shop.name ?? 'warung';
  return [
    `Halo! Sepertinya ${product?.name ?? 'barang rutin kamu'} sudah hampir habis.`,
    `Bisa pesan atau ambil lagi di ${shopName}.`,
    promoForSegment(segment),
  ].join('\n');
}

// Nightly: compute RFM segments and send due restock reminders to customers.
// Customer sends are metered (Koin Bot quota) + opt-in; owner is notified once when
// credits run out. Pure callable (cron + HTTP trigger).
export async function runCrmNotifier({ now = new Date() } = {}) {
  const shops = await Shop.find({});
  let remindersSent = 0;
  let customersSegmented = 0;

  for (const shop of shops) {
    const customers = await Customer.find({
      shopId: shop._id,
      phone: { $exists: true, $ne: null },
    });
    let quotaExhaustedNotified = false;

    for (const customer of customers) {
      const rfm = await computeRfmForCustomer({ shopId: shop._id, customerId: customer._id, now });
      customer.rfm = rfm;
      customersSegmented += 1;

      for (const prediction of customer.restockPredictions ?? []) {
        if (!isRestockReminderDue(plain(prediction), { now })) {
          continue;
        }

        const product = prediction.productId
          ? await Product.findById(prediction.productId)
          : null;
        const result = await sendCustomerBroadcast({
          shop,
          customer,
          text: restockMessage({ shop, product, segment: rfm.segment }),
        });

        if (result.sent) {
          prediction.lastReminderAt = now;
          remindersSent += 1;
        } else if (result.reason === 'quota_exhausted' && !quotaExhaustedNotified) {
          await notifyOwner(
            shop,
            'Koin Bot habis. Isi ulang untuk lanjut kirim pengingat belanja ke pelanggan.',
          );
          quotaExhaustedNotified = true;
        }
      }

      await customer.save();
    }
  }

  logger.info({ remindersSent, customersSegmented }, 'crmNotifier complete');
  return { remindersSent, customersSegmented };
}
