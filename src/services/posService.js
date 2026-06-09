import mongoose from 'mongoose';

import { extractEntities } from '../ai/extractor.js';
import { config } from '../config/index.js';
import { sendText } from '../messaging/whatsapp.js';
import { Product } from '../models/Product.js';
import { Transaction } from '../models/Transaction.js';
import { resolvePricing } from '../utils/pricing.js';
import { createPricedProduct, resolveProduct, learnAlias } from './productService.js';
import { setSessionState } from './sessionService.js';

const YES_REPLIES = new Set(['y', 'ya', 'iya', 'betul', 'benar', 'ok', 'oke']);
const NO_REPLIES = new Set(['t', 'tidak', 'nggak', 'gak', 'salah', 'batal']);

function todayInJakarta(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function normalizeReply(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase();
}

function transactionTypeForItems(items) {
  const actions = new Set(items.map((item) => item.action));

  if (actions.size === 1) {
    return actions.values().next().value;
  }

  return 'adjustment';
}

function lineTotal(qty, unitPrice) {
  return Math.round(qty * unitPrice);
}

// A stated price is interpreted by its priceBasis: 'total' (default) means the number is
// for the whole quantity — "3 telur 6000" = Rp6.000 for all 3 (Rp2.000 each); 'per_unit'
// means it's the price of one item — "3 telur 3000 per butir" = Rp3.000 each (Rp9.000 total).
// When no number is given, fall back to the product's set price as the per-unit price.
function resolveLine(extractedItem, product) {
  const qty = extractedItem.qty ?? 0;

  if (extractedItem.unitPrice != null) {
    return resolvePricing({
      qty,
      price: extractedItem.unitPrice,
      priceBasis: extractedItem.priceBasis,
    });
  }

  const setUnitPrice =
    extractedItem.action === 'sale' ? (product.sellPrice ?? 0) : (product.costPrice ?? 0);
  return { unitPrice: setUnitPrice, lineTotal: lineTotal(qty, setUnitPrice) };
}

function cashDeltaForItems(items) {
  return items.reduce((total, item) => {
    const signedTotal = item.action === 'sale' ? item.lineTotal : -item.lineTotal;
    return total + signedTotal;
  }, 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

function actionLabel(action) {
  return action === 'sale' ? 'laku' : 'masuk';
}

function formatQty(item) {
  return `${item.qty}${item.unit ? ` ${item.unit}` : ''}`;
}

function plainContext(context) {
  return context?.toObject?.() ?? context ?? {};
}

// Abort whatever multi-step flow the session is in: cancel a still-pending transaction (if
// any) and reset to idle. Used when the owner interrupts with a new command or types "batal".
export async function cancelPendingFlow({ session }) {
  const ctx = plainContext(session.context);

  if (ctx.pendingTransactionId) {
    const transaction = await Transaction.findOne({
      _id: ctx.pendingTransactionId,
      status: 'pending',
    });
    if (transaction) {
      transaction.status = 'cancelled';
      await transaction.save();
    }
  }

  await setSessionState(session, 'idle', {
    pendingTransactionId: undefined,
    failureCount: 0,
    lastQuestion: undefined,
    clarifyingText: undefined,
    pendingSummary: undefined,
    pendingPriceItem: undefined,
    pendingPriceUpdate: undefined,
    pendingPromoOrder: undefined,
  });
}

function needsPriceForItem(extractedItem, product) {
  if (extractedItem.unitPrice != null) {
    return { costPrice: false, sellPrice: false };
  }

  if (!product) {
    return {
      costPrice: extractedItem.action === 'stock_in',
      sellPrice: true,
    };
  }

  return {
    costPrice: extractedItem.action === 'stock_in' && product.costPrice == null,
    sellPrice: extractedItem.action === 'sale' && product.sellPrice == null,
  };
}

function hasPriceNeed(priceNeeds) {
  return priceNeeds.costPrice || priceNeeds.sellPrice;
}

function priceQuestionBase(item) {
  if (item.priceStep === 'sellPrice' || (!item.priceNeeds.costPrice && item.priceNeeds.sellPrice)) {
    return `Berapa harga jual per satuan untuk ${item.name}? Balas angka saja, contoh: 5000.`;
  }

  if (item.action === 'stock_in' && item.priceNeeds.costPrice) {
    return `Berapa modal beli untuk ${formatQty(item)} ${item.name}? Balas total modalnya, contoh: 240000.`;
  }

  if (item.priceNeeds.costPrice && item.priceNeeds.sellPrice) {
    return `Berapa harga modal untuk ${item.name}? Balas angka saja, contoh: 120000.`;
  }
  if (item.priceNeeds.costPrice) {
    return `Berapa harga modal untuk ${item.name}? Balas angka saja, contoh: 120000.`;
  }
  return `Berapa harga jual per satuan untuk ${item.name}? Balas angka saja, contoh: 5000.`;
}

function priceQuestionForPendingItem(item) {
  return `${priceQuestionBase(item)}\n(Belum tersimpan — balas angkanya, atau ketik "batal".)`;
}

function parseRupiah(value) {
  const normalized = String(value ?? '').replace(/[^\d]/g, '');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePriceReply(text) {
  const normalized = String(text ?? '').toLowerCase();
  const costMatch = normalized.match(/(?:modal|harga\s+modal|beli|kulak)\D*([\d.,]+)/iu);
  const sellMatch = normalized.match(/(?:jual|harga\s+jual)\D*([\d.,]+)/iu);
  const numbers = normalized.match(/\d[\d.,]*/gu)?.map(parseRupiah).filter(Boolean) ?? [];

  return {
    costPrice: costMatch ? parseRupiah(costMatch[1]) : numbers[0],
    sellPrice: sellMatch ? parseRupiah(sellMatch[1]) : numbers.length > 1 ? numbers[1] : numbers[0],
  };
}

function formatConfirmation(transaction) {
  const summary = transaction.items
    .map((item) => {
      const priceText = item.lineTotal ? ` ${formatMoney(item.lineTotal)}` : '';
      // Show the per-unit price when buying more than one, so a wrong total/per-unit
      // reading is visible before the owner confirms (never commit money silently).
      const perUnitText =
        item.qty > 1 && item.unitPrice ? ` @${formatMoney(item.unitPrice)}` : '';
      return `${formatQty(item)} ${item.name} (${actionLabel(item.action)}${priceText}${perUnitText})`;
    })
    .join(', ');
  const confidencePrefix =
    transaction.source === 'voice' &&
    transaction.sttConfidence != null &&
    transaction.sttConfidence < config.limits.sttLowConfidenceThreshold
      ? 'Aku kurang yakin dengan transkrip voice note. '
      : '';

  return `${confidencePrefix}Tercatat: ${summary}. Benar? Balas Y / T`;
}

async function buildPendingItems(shopId, extractedItems, options = {}) {
  const items = [];
  const resolvedProducts = [];

  for (const extractedItem of extractedItems) {
    const { product, rawName } = await resolveProduct(
      {
        shopId,
        rawName: extractedItem.rawName,
        unit: extractedItem.unit,
      },
      { ...options, createIfMissing: false },
    );

    const priceNeeds = needsPriceForItem(extractedItem, product);
    if (hasPriceNeed(priceNeeds)) {
      return {
        items,
        resolvedProducts,
        missingPriceItem: {
          rawName,
          name: product?.name ?? rawName,
          qty: extractedItem.qty,
          unit: extractedItem.unit ?? product?.unit,
          action: extractedItem.action,
          productId: product?._id,
          priceNeeds,
          priceStep:
            extractedItem.action === 'stock_in' && priceNeeds.costPrice ? 'costPrice' : 'sellPrice',
        },
      };
    }

    let finalProduct = product;
    if (!finalProduct) {
      const priced = resolvePricing({
        qty: extractedItem.qty,
        price: extractedItem.unitPrice ?? 0,
        priceBasis: extractedItem.priceBasis,
      });
      const unitPrice = priced?.unitPrice ?? 0;
      finalProduct = await createPricedProduct(
        {
          shopId,
          rawName,
          unit: extractedItem.unit,
          sellPrice: extractedItem.action === 'sale' ? unitPrice : undefined,
          costPrice: extractedItem.action === 'stock_in' ? unitPrice : undefined,
        },
        options,
      );
    }

    const { unitPrice, lineTotal: itemTotal } = resolveLine(extractedItem, finalProduct);

    resolvedProducts.push({ product: finalProduct, rawName });
    items.push({
      productId: finalProduct._id,
      name: finalProduct.name,
      rawName,
      qty: extractedItem.qty,
      unit: extractedItem.unit ?? finalProduct.unit,
      action: extractedItem.action,
      unitPrice,
      lineTotal: itemTotal,
    });
  }

  return { items, resolvedProducts };
}

async function createPendingTransaction({ shop, session, message, extraction, items }) {
  const transaction = await Transaction.create({
    shopId: shop._id,
    type: transactionTypeForItems(items),
    status: 'pending',
    source: message.type === 'audio' ? 'voice' : 'text',
    rawMessage: message.text,
    whatsappMessageId: message.messageId,
    sttConfidence: message.sttConfidence,
    extractionConfidence: extraction.confidence,
    items,
    totalAmount: items.reduce((total, item) => total + item.lineTotal, 0),
    cashDelta: cashDeltaForItems(items),
  });

  await setSessionState(session, 'awaiting_confirmation', {
    pendingTransactionId: transaction._id,
    failureCount: 0,
    pendingPriceItem: undefined,
    clarifyingText: undefined,
    pendingSummary: transaction.items.map((item) => `${formatQty(item)} ${item.name}`).join(', '),
  });
  await sendText(message.from, formatConfirmation(transaction));

  return transaction;
}

export async function handleTextPos({ shop, session, message }) {
  const extraction = await extractEntities({ text: message.text, shop });

  if (
    extraction.intent !== 'pos' ||
    extraction.needsClarification ||
    extraction.items.length === 0
  ) {
    // A query/unknown message may carry no clarification text — never send an empty reply.
    const question =
      extraction.clarificationQuestion ??
      'Maaf, aku belum paham. Kirim transaksi seperti "laku 2 indomie", atau ketik /bantuan untuk daftar perintah.';
    // Keep the original message so the owner's answer to this question is interpreted
    // together with it (handleClarifyingReply), not re-parsed in isolation and lost.
    await setSessionState(session, 'clarifying', {
      lastQuestion: question,
      clarifyingText: message.text,
    });
    await sendText(message.from, question);
    return { action: 'clarifying' };
  }

  const { items, missingPriceItem } = await buildPendingItems(shop._id, extraction.items);

  if (missingPriceItem) {
    const question = priceQuestionForPendingItem(missingPriceItem);
    await setSessionState(session, 'clarifying', {
      lastQuestion: question,
      pendingPriceItem: missingPriceItem,
    });
    await sendText(message.from, question);
    return { action: 'clarifying_missing_price' };
  }

  const transaction = await createPendingTransaction({
    shop,
    session,
    message,
    extraction,
    items,
  });

  return { action: 'pending_confirmation', transaction };
}

// The owner is answering a free-form AI clarification (e.g. "Satuan untuk telur dan
// harganya berapa?"). Merge their answer with the original message kept in context and
// re-run extraction on the combined text, so the answer has context instead of being
// parsed alone (which would lose the item and ask "transaksi apa ini?" again).
export async function handleClarifyingReply({ shop, session, message }) {
  const priorText = plainContext(session.context).clarifyingText;

  if (!priorText) {
    await setSessionState(session, 'idle', { clarifyingText: undefined });
    return handleTextPos({ shop, session, message });
  }

  const combinedText = `${priorText} ${message.text ?? ''}`.trim();
  await setSessionState(session, 'idle', {
    clarifyingText: undefined,
    lastQuestion: undefined,
  });

  return handleTextPos({
    shop,
    session,
    message: { ...message, text: combinedText },
  });
}

export async function handleMissingPriceReply({ shop, session, message }) {
  const pendingPriceItem = plainContext(session.context).pendingPriceItem;

  if (!pendingPriceItem) {
    await setSessionState(session, 'idle', { pendingPriceItem: undefined });
    return handleTextPos({ shop, session, message });
  }

  const prices = parsePriceReply(message.text);
  if (pendingPriceItem.priceStep === 'costPrice') {
    const modalTotal = prices.costPrice;

    if (!modalTotal) {
      const question = priceQuestionForPendingItem(pendingPriceItem);
      await setSessionState(session, 'clarifying', {
        lastQuestion: question,
        pendingPriceItem,
      });
      await sendText(message.from, question);
      return { action: 'clarifying_missing_price' };
    }

    if (pendingPriceItem.priceNeeds?.sellPrice) {
      const nextPendingPriceItem = {
        ...pendingPriceItem,
        modalTotal,
        priceStep: 'sellPrice',
        priceNeeds: {
          ...pendingPriceItem.priceNeeds,
          costPrice: false,
        },
      };
      const question = priceQuestionForPendingItem(nextPendingPriceItem);
      await setSessionState(session, 'clarifying', {
        lastQuestion: question,
        pendingPriceItem: nextPendingPriceItem,
      });
      await sendText(message.from, question);
      return { action: 'clarifying_missing_sell_price' };
    }

    pendingPriceItem.modalTotal = modalTotal;
    pendingPriceItem.priceNeeds = {
      ...pendingPriceItem.priceNeeds,
      costPrice: false,
    };
  }

  const costPrice =
    pendingPriceItem.modalTotal != null && pendingPriceItem.qty > 0
      ? Math.round(pendingPriceItem.modalTotal / pendingPriceItem.qty)
      : pendingPriceItem.priceNeeds?.costPrice
        ? prices.costPrice
        : undefined;
  const sellPrice = pendingPriceItem.priceNeeds?.sellPrice ? prices.sellPrice : undefined;
  const stillMissing = {
    costPrice: pendingPriceItem.priceNeeds?.costPrice && !costPrice,
    sellPrice: pendingPriceItem.priceNeeds?.sellPrice && !sellPrice,
  };

  if (hasPriceNeed(stillMissing)) {
    const nextPendingPriceItem = {
      ...pendingPriceItem,
      priceNeeds: stillMissing,
      priceStep: stillMissing.costPrice ? 'costPrice' : 'sellPrice',
    };
    const question = priceQuestionForPendingItem(nextPendingPriceItem);
    await setSessionState(session, 'clarifying', {
      lastQuestion: question,
      pendingPriceItem: nextPendingPriceItem,
    });
    await sendText(message.from, question);
    return { action: 'clarifying_missing_price' };
  }

  let product;
  if (pendingPriceItem.productId) {
    product = await Product.findById(pendingPriceItem.productId);
    if (!product) {
      await setSessionState(session, 'idle', { pendingPriceItem: undefined });
      await sendText(message.from, 'Produk tidak ditemukan. Tolong kirim transaksi ulang.');
      return { action: 'missing_product_for_price' };
    }
    if (costPrice != null) {
      product.costPrice = costPrice;
    }
    if (sellPrice != null) {
      product.sellPrice = sellPrice;
    }
    await product.save();
  } else {
    product = await createPricedProduct({
      shopId: shop._id,
      rawName: pendingPriceItem.rawName,
      unit: pendingPriceItem.unit,
      costPrice,
      sellPrice,
    });
  }

  const unitPrice = pendingPriceItem.action === 'sale' ? product.sellPrice : product.costPrice;
  const item = {
    productId: product._id,
    name: product.name,
    rawName: pendingPriceItem.rawName,
    qty: pendingPriceItem.qty,
    unit: pendingPriceItem.unit ?? product.unit,
    action: pendingPriceItem.action,
    unitPrice,
    lineTotal:
      pendingPriceItem.action === 'stock_in' && pendingPriceItem.modalTotal != null
        ? pendingPriceItem.modalTotal
        : lineTotal(pendingPriceItem.qty, unitPrice),
  };
  const transaction = await createPendingTransaction({
    shop,
    session,
    message: {
      ...message,
      text: `${pendingPriceItem.action === 'sale' ? 'laku' : 'masuk'} ${formatQty(item)} ${pendingPriceItem.rawName} ${message.text}`,
    },
    extraction: { confidence: 1 },
    items: [item],
  });

  return { action: 'pending_confirmation', transaction };
}

async function assertFreeTierCanCommit(shop, options = {}) {
  if (shop.tier !== 'free') {
    return;
  }

  const today = todayInJakarta();
  const count = shop.quotas?.dailyTxnDate === today ? (shop.quotas.dailyTxnCount ?? 0) : 0;

  if (count >= config.limits.freeTierDailyTxnCap) {
    throw new Error('FREE_TIER_DAILY_TXN_CAP exceeded');
  }

  shop.quotas = {
    ...(shop.quotas?.toObject?.() ?? shop.quotas ?? {}),
    dailyTxnDate: today,
    dailyTxnCount: count + 1,
  };
  await shop.save(options);
}

async function applyProductStock(transaction, options = {}) {
  for (const item of transaction.items) {
    const product = await Product.findById(item.productId).session?.(options.session);

    if (!product) {
      continue;
    }

    product.stock += item.action === 'sale' ? -item.qty : item.qty;
    await product.save(options);
  }
}

async function commitCore({ shop, transaction }, options = {}) {
  await assertFreeTierCanCommit(shop, options);
  await applyProductStock(transaction, options);

  transaction.status = 'committed';
  transaction.committedAt = new Date();
  await transaction.save(options);
}

async function commitWithBestAvailableAtomicity(args) {
  try {
    await mongoose.connection.transaction(async (mongoSession) => {
      await commitCore(args, { session: mongoSession });
    });
  } catch (error) {
    if (!/Transaction numbers|replica set|not supported|retryable writes/i.test(error.message)) {
      throw error;
    }

    await commitCore(args);
  }
}

export async function confirmPendingTransaction({ shop, session, message }) {
  const reply = normalizeReply(message.text);
  const pendingTransactionId = session.context?.pendingTransactionId;

  if (YES_REPLIES.has(reply)) {
    const transaction = await Transaction.findOne({
      _id: pendingTransactionId,
      shopId: shop._id,
      status: 'pending',
    });

    if (!transaction) {
      await setSessionState(session, 'idle', { pendingTransactionId: undefined });
      await sendText(message.from, 'Tidak ada transaksi pending.');
      return { action: 'missing_pending_transaction' };
    }

    await commitWithBestAvailableAtomicity({ shop, transaction });

    for (const item of transaction.items) {
      const product = await Product.findById(item.productId);
      await learnAlias(product, item.rawName);
    }

    await setSessionState(session, 'idle', {
      pendingTransactionId: undefined,
      failureCount: 0,
    });
    await sendText(message.from, `Tersimpan. Kas berubah ${formatMoney(transaction.cashDelta)}.`);
    return { action: 'committed', transaction };
  }

  if (NO_REPLIES.has(reply)) {
    const transaction = await Transaction.findOne({
      _id: pendingTransactionId,
      shopId: shop._id,
      status: 'pending',
    });

    if (transaction) {
      transaction.status = 'cancelled';
      await transaction.save();
    }

    const failureCount = (session.context?.failureCount ?? 0) + 1;

    if (failureCount >= 2) {
      await setSessionState(session, 'fast_text_fallback', {
        pendingTransactionId: undefined,
        failureCount,
      });
      await sendText(message.from, 'Ketik: <jual/masuk> <jumlah> <barang>. Contoh: jual 2 indomie');
      return { action: 'fast_text_fallback' };
    }

    await setSessionState(session, 'correcting', {
      pendingTransactionId: undefined,
      failureCount,
    });
    await sendText(message.from, 'Dibatalkan. Apa yang salah? Kirim ulang dengan benar.');
    return { action: 'cancelled' };
  }

  await sendText(message.from, 'Balas Y untuk simpan atau T untuk batal.');
  return { action: 'confirmation_unrecognized' };
}

export const posFormatting = {
  formatConfirmation,
};
