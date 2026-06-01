import mongoose from 'mongoose';

import { extractEntities } from '../ai/extractor.js';
import { config } from '../config/index.js';
import { sendText } from '../messaging/whatsapp.js';
import { Product } from '../models/Product.js';
import { Transaction } from '../models/Transaction.js';
import { resolveProduct, learnAlias } from './productService.js';
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

function priceForItem(extractedItem, product) {
  if (extractedItem.unitPrice != null) {
    return extractedItem.unitPrice;
  }

  if (extractedItem.action === 'sale') {
    return product.sellPrice ?? 0;
  }

  return product.costPrice ?? 0;
}

function lineTotal(qty, unitPrice) {
  return Math.round(qty * unitPrice);
}

function cashDeltaForItems(items) {
  return items.reduce((total, item) => {
    const signedTotal = item.action === 'sale' ? item.lineTotal : -item.lineTotal;
    return total + signedTotal;
  }, 0);
}

function findMissingSalePrice(items) {
  return items.find((item) => item.action === 'sale' && !item.unitPrice);
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

function formatConfirmation(transaction) {
  const summary = transaction.items
    .map((item) => {
      const priceText = item.lineTotal ? ` ${formatMoney(item.lineTotal)}` : '';
      return `${formatQty(item)} ${item.name} (${actionLabel(item.action)}${priceText})`;
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
      options,
    );
    const unitPrice = priceForItem(extractedItem, product);

    resolvedProducts.push({ product, rawName });
    items.push({
      productId: product._id,
      name: product.name,
      rawName,
      qty: extractedItem.qty,
      unit: extractedItem.unit ?? product.unit,
      action: extractedItem.action,
      unitPrice,
      lineTotal: lineTotal(extractedItem.qty, unitPrice),
    });
  }

  return { items, resolvedProducts };
}

export async function handleTextPos({ shop, session, message }) {
  const extraction = await extractEntities({ text: message.text, shop });

  if (
    extraction.intent !== 'pos' ||
    extraction.needsClarification ||
    extraction.items.length === 0
  ) {
    await setSessionState(session, 'clarifying', {
      lastQuestion: extraction.clarificationQuestion,
    });
    await sendText(message.from, extraction.clarificationQuestion);
    return { action: 'clarifying' };
  }

  const { items } = await buildPendingItems(shop._id, extraction.items);
  const missingPriceItem = findMissingSalePrice(items);

  if (missingPriceItem) {
    const question = `Harga ${missingPriceItem.name} berapa? Kirim ulang dengan harga, contoh: laku ${formatQty(missingPriceItem)} ${missingPriceItem.rawName} 20000.`;
    await setSessionState(session, 'clarifying', {
      lastQuestion: question,
    });
    await sendText(message.from, question);
    return { action: 'clarifying_missing_price' };
  }

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
  });
  await sendText(message.from, formatConfirmation(transaction));

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
