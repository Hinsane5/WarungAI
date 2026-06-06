import { sendText } from '../messaging/whatsapp.js';
import { resolveProduct } from './productService.js';
import {
  findActivePromoForProduct,
  formatPromoLine,
  recordPromoOrder,
} from './promoService.js';
import { setSessionState } from './sessionService.js';

const CONFIRM = /^\s*(ya|iya|y|ok|oke|pesan|order|mau|boleh)\s*$/iu;
const DECLINE = /^\s*(tidak|ngga|nggak|gak|no|t|batal|skip)\s*$/iu;

function plainContext(context) {
  return context?.toObject?.() ?? context ?? {};
}

export function parseStockCheckCommand(text) {
  const match = String(text ?? '').match(/^\s*(?:cek\s+stok|cek\s+stock|stok)\s+(.+?)\s*$/iu);
  return match ? match[1].trim() : null;
}

export function parsePromoConfirm(text) {
  return CONFIRM.test(String(text ?? ''));
}

export function parsePromoDecline(text) {
  return DECLINE.test(String(text ?? ''));
}

// "cek stok <produk>" → report stock, and inject any matching sponsored distributor promo
// for the shop's region (the Targeted B2B Promo). A matching promo arms a one-tap group-buy.
export async function handleStockCheck({ shop, session, message }) {
  const rawName = parseStockCheckCommand(message.text);
  if (!rawName) {
    return null;
  }

  const { product } = await resolveProduct(
    { shopId: shop._id, rawName },
    { createIfMissing: false },
  );

  if (!product) {
    await sendText(message.from, `Produk "${rawName}" belum ada di katalog.`);
    return { action: 'stock_check_not_found' };
  }

  const stock = product.stock ?? 0;
  const low = product.reorderPoint != null && stock <= product.reorderPoint;
  const lines = [
    `Stok ${product.name}: ${stock}${product.unit ? ` ${product.unit}` : ''}${
      low ? ' (di bawah batas minimum)' : ''
    }.`,
  ];

  const promo = await findActivePromoForProduct({
    region: shop.region,
    productName: product.name,
  });

  if (promo) {
    lines.push(formatPromoLine(promo));
    lines.push('Mau pesan sekarang? Balas "ya".');
    await setSessionState(session, 'awaiting_promo_order', {
      pendingPromoOrder: {
        promoId: String(promo._id),
        brand: promo.brand,
        distributor: promo.distributor,
        commissionPct: promo.commissionPct ?? 0,
      },
    });
  }

  await sendText(message.from, lines.join('\n'));
  return { action: promo ? 'stock_check_promo' : 'stock_check' };
}

export async function handlePromoOrderReply({ shop, session, message }) {
  const pending = plainContext(session.context).pendingPromoOrder;
  if (!pending) {
    return null;
  }

  if (parsePromoConfirm(message.text)) {
    const result = await recordPromoOrder({
      shop,
      promo: {
        _id: pending.promoId,
        brand: pending.brand,
        distributor: pending.distributor,
        commissionPct: pending.commissionPct,
      },
    });
    await setSessionState(session, 'idle', { pendingPromoOrder: undefined });
    await sendText(
      message.from,
      `Pesanan diteruskan ke ${result.distributor}. WarungAI dapat komisi ${result.commissionPct}% dari group-buy ini.`,
    );
    return { action: 'promo_ordered' };
  }

  if (parsePromoDecline(message.text)) {
    await setSessionState(session, 'idle', { pendingPromoOrder: undefined });
    await sendText(message.from, 'Oke, tidak jadi pesan.');
    return { action: 'promo_declined' };
  }

  // Not a promo response — clear the prompt and let normal routing handle the message.
  await setSessionState(session, 'idle', { pendingPromoOrder: undefined });
  return null;
}
