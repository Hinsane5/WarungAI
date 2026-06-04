import { sendText } from '../messaging/whatsapp.js';
import { findProductByName, updateProductPrice } from './productService.js';
import { setSessionState } from './sessionService.js';

const PRICE_KIND_LABELS = {
  sellPrice: 'harga jual',
  costPrice: 'harga modal',
};

function parseRupiah(value) {
  const normalized = String(value ?? '').replace(/[^\d]/g, '');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePriceKind(value) {
  if (/jual/iu.test(value)) {
    return 'sellPrice';
  }
  if (/(?:modal|beli)/iu.test(value)) {
    return 'costPrice';
  }
  return null;
}

export function parsePriceUpdateCommand(text) {
  const match = String(text ?? '').match(
    /^\s*(?:ubah|ganti|atur|set)\s+(?<kind>harga\s+jual|harga\s+modal|modal\s+beli|harga\s+beli|jual|modal|beli)\s+(?<rest>.+?)\s*$/iu,
  );

  if (!match?.groups) {
    return null;
  }

  const priceType = parsePriceKind(match.groups.kind);
  const rest = match.groups.rest.trim();
  const explicitPriceMatch = rest.match(/^(?<rawName>.+?)\s+(?:jadi|ke|=)\s*(?:rp\s*)?(?<price>[\d.]+)\s*$/iu);

  if (explicitPriceMatch?.groups) {
    return {
      priceType,
      rawName: explicitPriceMatch.groups.rawName.trim(),
      price: parseRupiah(explicitPriceMatch.groups.price),
    };
  }

  return { priceType, rawName: rest, price: null };
}

function formatMoney(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

function questionForUpdate(productName, priceType) {
  return `${PRICE_KIND_LABELS[priceType]} baru untuk ${productName} berapa? Balas angka saja, contoh: 15000.`;
}

async function sendProductNotFound(to, rawName) {
  await sendText(to, `Produk "${rawName}" belum ada di katalog. Tambahkan produknya dulu, lalu ubah harga.`);
}

export async function handlePriceUpdateCommand({ shop, session, message }) {
  const command = parsePriceUpdateCommand(message.text);

  if (!command) {
    return null;
  }

  const product = await findProductByName({ shopId: shop._id, rawName: command.rawName });
  if (!product) {
    await sendProductNotFound(message.from, command.rawName);
    return { action: 'price_update_product_not_found' };
  }

  if (!command.price) {
    const question = questionForUpdate(product.name, command.priceType);
    await setSessionState(session, 'clarifying', {
      lastQuestion: question,
      pendingPriceUpdate: {
        productId: product._id,
        productName: product.name,
        priceType: command.priceType,
      },
    });
    await sendText(message.from, question);
    return { action: 'clarifying_price_update' };
  }

  const updatedProduct = await updateProductPrice({
    shopId: shop._id,
    productId: product._id,
    priceType: command.priceType,
    price: command.price,
  });

  await setSessionState(session, 'idle', { pendingPriceUpdate: undefined });
  await sendText(
    message.from,
    `${PRICE_KIND_LABELS[command.priceType]} ${updatedProduct.name} diubah menjadi ${formatMoney(command.price)}.`,
  );
  return { action: 'price_updated', product: updatedProduct };
}

export async function handlePendingPriceUpdateReply({ shop, session, message }) {
  const pendingPriceUpdate = session.context?.toObject?.().pendingPriceUpdate ?? session.context?.pendingPriceUpdate;

  if (!pendingPriceUpdate) {
    return null;
  }

  const price = parseRupiah(message.text);
  if (!price) {
    const question = questionForUpdate(pendingPriceUpdate.productName, pendingPriceUpdate.priceType);
    await setSessionState(session, 'clarifying', {
      lastQuestion: question,
      pendingPriceUpdate,
    });
    await sendText(message.from, question);
    return { action: 'clarifying_price_update' };
  }

  const updatedProduct = await updateProductPrice({
    shopId: shop._id,
    productId: pendingPriceUpdate.productId,
    priceType: pendingPriceUpdate.priceType,
    price,
  });

  if (!updatedProduct) {
    await setSessionState(session, 'idle', { pendingPriceUpdate: undefined });
    await sendText(message.from, 'Produk tidak ditemukan. Tolong coba lagi dari awal.');
    return { action: 'price_update_product_not_found' };
  }

  await setSessionState(session, 'idle', { pendingPriceUpdate: undefined });
  await sendText(
    message.from,
    `${PRICE_KIND_LABELS[pendingPriceUpdate.priceType]} ${updatedProduct.name} diubah menjadi ${formatMoney(price)}.`,
  );
  return { action: 'price_updated', product: updatedProduct };
}
