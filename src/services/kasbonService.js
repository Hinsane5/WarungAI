import { extractEntities } from '../ai/extractor.js';
import { config } from '../config/index.js';
import { sendText } from '../messaging/whatsapp.js';
import { Customer } from '../models/Customer.js';
import { Kasbon } from '../models/Kasbon.js';
import { logger } from '../utils/logger.js';
import { resolvePricing } from '../utils/pricing.js';
import { resolveProduct } from './productService.js';
import { setSessionState } from './sessionService.js';

const REMINDER_APPROVAL_YES = new Set(['kirim', 'ya', 'y', 'ok', 'oke']);
const REMINDER_APPROVAL_NO = new Set(['batal', 't', 'tidak', 'nggak', 'gak']);
function normalizeAlias(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleCase(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMoney(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQty(item) {
  return `${item.qty}${item.unit ? ` ${item.unit}` : ''}`;
}

function todayStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysOverdue(dueDate, now = new Date()) {
  if (!dueDate) {
    return 0;
  }

  const diffMs = todayStart(now).getTime() - todayStart(new Date(dueDate)).getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function bandForRisk(risk) {
  if (risk >= config.limits.kasbonRiskyRiskThreshold) {
    return 'risky';
  }

  if (risk >= config.limits.kasbonWatchRiskThreshold) {
    return 'watch';
  }

  return 'good';
}

function plainContext(context) {
  return context?.toObject?.() ?? context ?? {};
}

function customerQuery(shopId, alias) {
  const normalizedAlias = normalizeAlias(alias);
  return {
    shopId,
    $or: [
      { name: new RegExp(`^${escapeRegExp(normalizedAlias)}$`, 'i') },
      { aliases: normalizedAlias },
    ],
  };
}

async function findOrCreateCustomer({ shopId, customerRef }) {
  const normalizedAlias = normalizeAlias(customerRef);
  let customer = await Customer.findOne(customerQuery(shopId, normalizedAlias));

  if (customer) {
    if (!(customer.aliases ?? []).includes(normalizedAlias)) {
      customer.aliases = [...(customer.aliases ?? []), normalizedAlias];
      await customer.save();
    }

    return { customer, created: false };
  }

  customer = await Customer.create({
    shopId,
    name: titleCase(customerRef),
    aliases: [normalizedAlias],
    loyalty: { joinedVia: 'manual' },
  });

  return { customer, created: true };
}

async function buildKasbonItems(shopId, extractedItems) {
  const items = [];

  for (const extractedItem of extractedItems) {
    const { product } = await resolveProduct({
      shopId,
      rawName: extractedItem.rawName,
      unit: extractedItem.unit,
    });
    const qty = extractedItem.qty;
    // Same price semantics as POS: a stated number defaults to the total for the whole
    // quantity ('total'); 'per_unit' multiplies. With no stated price, fall back to the
    // product's per-unit sell price.
    const priced =
      extractedItem.unitPrice != null
        ? resolvePricing({ qty, price: extractedItem.unitPrice, priceBasis: extractedItem.priceBasis })
        : { unitPrice: product.sellPrice ?? 0, lineTotal: Math.round(qty * (product.sellPrice ?? 0)) };

    items.push({
      name: product.name,
      qty,
      unit: extractedItem.unit ?? product.unit,
      unitPrice: priced.unitPrice,
      lineTotal: priced.lineTotal,
    });
  }

  return items;
}

function findMissingPrice(items) {
  return items.find((item) => !item.unitPrice);
}

function summarizeItems(items) {
  return items
    .map((item) => `${formatQty(item)} ${item.name} ${formatMoney(item.lineTotal)}`)
    .join(', ');
}

function formatOwnerKasbonMessage({ customer, kasbon, score }) {
  const lines = [
    '📒 *Kasbon Tercatat*',
    `👤 ${customer.name}`,
    `🛒 ${summarizeItems(kasbon.items)}`,
    `💵 Total kasbon baru: ${formatMoney(kasbon.amount)}`,
  ];

  if (score.band === 'watch') {
    lines.push(
      '',
      `⚠️ Catatan: ${customer.name} masuk kategori watch. Risiko saat ini ${formatMoney(score.value)}.`,
    );
  }

  if (score.band === 'risky') {
    lines.push(
      '',
      `🚨 Peringatan: ${customer.name} masuk kategori risky. Risiko saat ini ${formatMoney(score.value)}.`,
    );
    lines.push(`Ketik "tagih ${customer.name}" untuk menyiapkan draft pengingat.`);
  }

  return lines.join('\n');
}

function formatCustomerDebtDetail({ shop, kasbon }) {
  const shopName = shop.name ?? 'Warung';
  return [
    '📒 *Detail Kasbon Kamu*',
    `Info kasbon dari ${shopName}: ${summarizeItems(kasbon.items)}.`,
    `💵 Total: ${formatMoney(kasbon.amount)}.`,
    'Simpan pesan ini sebagai catatan hutang kamu.',
  ].join('\n');
}

function defaultDueDate(now = new Date()) {
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + config.limits.kasbonDefaultDueDays);
  return dueDate;
}

async function createOrUpdateOpenKasbon({ shopId, customerId, items, amount }) {
  const existingKasbon = await Kasbon.findOne({
    shopId,
    customerId,
    status: 'open',
  });

  if (!existingKasbon) {
    return Kasbon.create({
      shopId,
      customerId,
      status: 'open',
      items,
      amount,
      originalAmount: amount,
      dueDate: defaultDueDate(),
    });
  }

  existingKasbon.items = [...(existingKasbon.items ?? []), ...items];
  existingKasbon.amount = (existingKasbon.amount ?? 0) + amount;
  existingKasbon.originalAmount = (existingKasbon.originalAmount ?? 0) + amount;
  await existingKasbon.save();

  return existingKasbon;
}

function reminderText({ shop, customer, totalOutstanding }) {
  const shopName = shop.name ?? 'warung kami';
  return [
    `Halo ${customer.name}, ini pengingat kasbon di ${shopName}.`,
    `Total yang masih terbuka: ${formatMoney(totalOutstanding)}.`,
    'Kalau sudah sempat, mohon dibayar ke warung ya. Terima kasih.',
  ].join('\n');
}

export async function computeCreditScore({ customerId, now = new Date() }) {
  const kasbons = await Kasbon.find({ customerId });
  const totalOutstanding = kasbons
    .filter((kasbon) => kasbon.status === 'open')
    .reduce((total, kasbon) => total + (kasbon.amount ?? 0), 0);
  const maxDaysOverdue = kasbons
    .filter((kasbon) => kasbon.status === 'open')
    .reduce((max, kasbon) => Math.max(max, daysOverdue(kasbon.dueDate, now)), 0);
  const repaymentFrequency = kasbons.filter(
    (kasbon) => kasbon.status === 'settled' || (kasbon.payments ?? []).length > 0,
  ).length;
  const value = Math.round((totalOutstanding * maxDaysOverdue) / Math.max(repaymentFrequency, 1));

  return {
    value,
    band: bandForRisk(value),
    inputs: {
      totalOutstanding,
      daysOverdue: maxDaysOverdue,
      repaymentFrequency,
    },
  };
}

export async function refreshCustomerCreditScore(customer, options = {}) {
  const score = await computeCreditScore({ customerId: customer._id, now: options.now });

  customer.creditScore = {
    value: score.value,
    band: score.band,
    updatedAt: new Date(),
  };
  await customer.save();

  return score;
}

export async function recordKasbonPayment({ shopId, kasbonId, amount, note }) {
  const kasbon = await Kasbon.findOne({ _id: kasbonId, shopId });

  if (!kasbon) {
    throw new Error('Kasbon not found');
  }

  kasbon.payments = [...(kasbon.payments ?? []), { amount, paidAt: new Date(), note }];
  kasbon.amount = Math.max(0, (kasbon.amount ?? 0) - amount);
  kasbon.status = kasbon.amount === 0 ? 'settled' : 'open';
  await kasbon.save();

  const customer = await Customer.findOne({ _id: kasbon.customerId, shopId });
  const score = customer ? await refreshCustomerCreditScore(customer) : null;

  return { kasbon, score };
}

export async function handleKasbon({ shop, session, message }) {
  const extraction = await extractEntities({ text: message.text, shop });

  if (
    extraction.intent !== 'kasbon' ||
    extraction.needsClarification ||
    extraction.items.length === 0 ||
    !extraction.customerRef
  ) {
    const question =
      extraction.clarificationQuestion ??
      'Kasbon atas nama siapa dan barangnya apa? Contoh: "kasbon budi 2 rokok".';
    await setSessionState(session, 'clarifying', { lastQuestion: question });
    await sendText(message.from, question);
    return { action: 'clarifying_kasbon' };
  }

  const { customer } = await findOrCreateCustomer({
    shopId: shop._id,
    customerRef: extraction.customerRef,
  });
  const items = await buildKasbonItems(shop._id, extraction.items);
  const missingPriceItem = findMissingPrice(items);

  if (missingPriceItem) {
    const question = `Harga ${missingPriceItem.name} berapa? Kirim ulang dengan harga, contoh: kasbon ${extraction.customerRef} ${formatQty(missingPriceItem)} ${missingPriceItem.name} 20000.`;
    await setSessionState(session, 'clarifying', { lastQuestion: question });
    await sendText(message.from, question);
    return { action: 'clarifying_kasbon_missing_price' };
  }

  const amount = items.reduce((total, item) => total + item.lineTotal, 0);
  const kasbon = await createOrUpdateOpenKasbon({
    shopId: shop._id,
    customerId: customer._id,
    items,
    amount,
  });
  const score = await refreshCustomerCreditScore(customer);

  if (customer.phone) {
    try {
      await sendText(customer.phone, formatCustomerDebtDetail({ shop, kasbon }));
    } catch (error) {
      logger.warn(
        {
          err: error,
          shopId: shop._id,
          customerId: customer._id,
          kasbonId: kasbon._id,
        },
        'Customer kasbon detail send failed',
      );
    }
  }

  await setSessionState(session, 'idle', {
    lastQuestion: undefined,
    pendingKasbonId: undefined,
  });
  await sendText(message.from, formatOwnerKasbonMessage({ customer, kasbon, score }));

  return { action: 'kasbon_recorded', kasbon, customer, score };
}

export function parseReminderCommand(text) {
  const match = String(text ?? '').match(/^\s*(?:tagih|ingatkan)\s+(.+?)\s*$/iu);
  return match?.[1]?.trim() ?? null;
}

export async function draftKasbonReminder({ shop, session, message }) {
  const customerRef = parseReminderCommand(message.text);

  if (!customerRef) {
    return null;
  }

  const customer = await Customer.findOne(customerQuery(shop._id, customerRef));

  if (!customer) {
    await sendText(message.from, `Pelanggan "${customerRef}" belum ditemukan.`);
    return { action: 'kasbon_reminder_customer_missing' };
  }

  const openKasbons = await Kasbon.find({
    shopId: shop._id,
    customerId: customer._id,
    status: 'open',
  });
  const totalOutstanding = openKasbons.reduce((total, kasbon) => total + (kasbon.amount ?? 0), 0);

  if (openKasbons.length === 0 || totalOutstanding <= 0) {
    await sendText(message.from, `Tidak ada kasbon terbuka untuk ${customer.name}.`);
    return { action: 'kasbon_reminder_no_open_debt' };
  }

  const draft = reminderText({ shop, customer, totalOutstanding });
  await setSessionState(session, 'awaiting_kasbon_reminder_approval', {
    reminderCustomerId: customer._id,
    reminderKasbonIds: openKasbons.map((kasbon) => kasbon._id),
    reminderMessage: draft,
  });
  await sendText(
    message.from,
    [`📤 *Draft Pengingat* untuk ${customer.name}:`, '', draft, '', 'Kirim? Balas *KIRIM* / *BATAL*.'].join(
      '\n',
    ),
  );

  return { action: 'kasbon_reminder_drafted', customer, openKasbons, draft };
}

export async function approveKasbonReminder({ shop, session, message }) {
  const reply = normalizeAlias(message.text);
  const context = plainContext(session.context);

  if (REMINDER_APPROVAL_NO.has(reply)) {
    await setSessionState(session, 'idle', {
      reminderCustomerId: undefined,
      reminderKasbonIds: undefined,
      reminderMessage: undefined,
    });
    await sendText(message.from, 'Draft pengingat dibatalkan.');
    return { action: 'kasbon_reminder_cancelled' };
  }

  if (!REMINDER_APPROVAL_YES.has(reply)) {
    await sendText(
      message.from,
      'Balas KIRIM untuk mengirim pengingat, atau BATAL untuk membatalkan.',
    );
    return { action: 'kasbon_reminder_approval_needed' };
  }

  const customer = await Customer.findOne({ _id: context.reminderCustomerId, shopId: shop._id });

  if (!customer?.phone) {
    await setSessionState(session, 'idle', {
      reminderCustomerId: undefined,
      reminderKasbonIds: undefined,
      reminderMessage: undefined,
    });
    await sendText(
      message.from,
      'Nomor WhatsApp pelanggan belum tersimpan, jadi pengingat tidak dikirim.',
    );
    return { action: 'kasbon_reminder_missing_phone' };
  }

  await sendText(customer.phone, context.reminderMessage);

  const kasbons = await Kasbon.find({
    _id: { $in: context.reminderKasbonIds ?? [] },
    shopId: shop._id,
    customerId: customer._id,
  });

  for (const kasbon of kasbons) {
    kasbon.remindersSent = [
      ...(kasbon.remindersSent ?? []),
      { sentAt: new Date(), channel: 'whatsapp', approvedByOwner: true },
    ];
    await kasbon.save();
  }

  await setSessionState(session, 'idle', {
    reminderCustomerId: undefined,
    reminderKasbonIds: undefined,
    reminderMessage: undefined,
  });
  await sendText(message.from, `Pengingat kasbon untuk ${customer.name} sudah dikirim.`);

  return { action: 'kasbon_reminder_sent', customer, kasbons };
}
