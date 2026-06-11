import { askWarungAssistant } from '../ai/assistant.js';
import { sendText } from '../messaging/whatsapp.js';
import {
  getCreditScores,
  getPredictiveRestock,
  getProfit,
} from './analyticsService.js';
import { previewProactiveCrm } from './crmPreviewService.js';
import { listDashboardProducts, resolveProduct } from './productService.js';

function money(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

// How-to / explanatory questions go to the Gemini assistant, not a data lookup — even if
// they happen to contain a data word (e.g. "gimana cara catat penjualan").
const HOWTO_RE = /\b(gimana|bagaimana|cara|caranya|apa\s*itu|kenapa|kapan|jelas(?:kan|in)?)\b/iu;
const PROFIT_RE = /\b(untung|laba|profit|keuntungan|net\s*profit)\b/iu;
const SALES_RE = /\b(omzet|omset|pendapatan|pemasukan|penjualan|laku\s*berapa)\b/iu;
// Matches "restok"/"restock"/"direstok"/"direstock", plus kulak/menipis/habis cues.
const RESTOCK_RE =
  /\bmenipis\b|\bhabis\b|\bkulak(?:an)?\b|\b(?:di)?resto(?:ck|k)\b|\b(?:perlu|harus)\b.*\b(?:beli|kulak|stok)\b/iu;
const CRM_RE = /\b(crm|ingatkan\s*pelanggan|pengingat\s*pelanggan|pelanggan.*(?:ingat|reminder))\b/iu;
// "lihat semua produk", "daftar barang", "katalog", "produk apa saja yang saya jual", etc.
const PRODUCT_LIST_RE =
  /\b(?:semua|daftar|list|katalog|seluruh)\b.*\b(?:produk|barang|jual|dagangan)\b|\b(?:produk|barang|katalog|dagangan|jualan)\b.*\b(?:apa\s*(?:saja|aja)|yang\s*(?:saya\s*)?(?:di)?jual|punya|di\s*warung)\b|\b(?:lihat|liat|tampil\w*|tunjuk\w*)\b.*\b(?:produk|barang|katalog|dagangan)\b/iu;
const KASBON_RE = /\b(kasbon|hutang|utang|piutang)\b/iu;
const STOCK_RE = /\b(stok|stock|sisa|tinggal|masih\s*ada)\b/iu;

function detectPeriod(text) {
  return /\bbulan(?:\s*ini|an)?\b|sebulan|month/iu.test(String(text ?? '')) ? 'month' : 'today';
}

// Classify a question into a deterministic data query, or 'general' for the Gemini fallback.
export function classifyQuery(text) {
  const t = String(text ?? '');
  if (HOWTO_RE.test(t)) return { type: 'general' };
  if (PROFIT_RE.test(t)) return { type: 'profit', period: detectPeriod(t) };
  if (RESTOCK_RE.test(t)) return { type: 'restock' };
  if (CRM_RE.test(t)) return { type: 'crm' };
  if (PRODUCT_LIST_RE.test(t)) return { type: 'product_list' };
  if (SALES_RE.test(t)) return { type: 'sales', period: detectPeriod(t) };
  if (KASBON_RE.test(t)) return { type: 'kasbon' };
  if (STOCK_RE.test(t)) return { type: 'stock' };
  return { type: 'general' };
}

// True when the message is a data question the bot can answer deterministically (so the
// router can route it without an AI extraction call).
export function isAnsweredQuery(text) {
  return classifyQuery(text).type !== 'general';
}

function extractProductName(text) {
  return (
    String(text ?? '')
      .replace(
        /\b(berapa|sisa|stok|stock|tinggal|masih|ada|sekarang|ya|dong|cek|lihat|punya|kita|saya|sekang|brp)\b/giu,
        '',
      )
      .replace(/[?.!]/gu, '')
      .replace(/\s+/gu, ' ')
      .trim() || null
  );
}

function periodLabel(period) {
  return period === 'month' ? 'bulan ini' : 'hari ini';
}

async function answerProfit(shop, message, period) {
  const p = await getProfit(shop, { period });
  const note = p.hasUnknownCost ? '\n_*estimasi — sebagian harga modal belum diisi_' : '';
  await sendText(
    message.from,
    `🟢 *Laba bersih ${periodLabel(period)}*: ${money(p.profit)}\n` +
      `Omzet ${money(p.revenue)} − modal ${money(p.cost)}.${note}`,
  );
  return { action: 'query_profit', period };
}

async function answerSales(shop, message, period) {
  const p = await getProfit(shop, { period });
  await sendText(message.from, `💰 *Omzet ${periodLabel(period)}*: ${money(p.revenue)}.`);
  return { action: 'query_sales', period };
}

async function answerRestock(shop, message) {
  const items = await getPredictiveRestock(shop);
  if (items.length === 0) {
    await sendText(message.from, 'Stok aman 👍 — belum ada barang yang perlu direstok sekarang.');
    return { action: 'query_restock' };
  }
  const lines = ['📦 *Perlu Restok* :'];
  for (const item of items) {
    const eta = item.daysToStockout != null ? `, ~${item.daysToStockout} hari lagi` : '';
    lines.push(`- ${item.name}: sisa ${item.remaining} ${item.unit}${eta}`);
  }
  await sendText(message.from, lines.join('\n'));
  return { action: 'query_restock' };
}

async function answerKasbon(shop, message) {
  const scores = await getCreditScores(shop);
  if (scores.length === 0) {
    await sendText(message.from, 'Tidak ada kasbon terbuka saat ini 👍.');
    return { action: 'query_kasbon' };
  }
  const total = scores.reduce((sum, s) => sum + (s.debt ?? 0), 0);
  const lines = [`📒 *Total Kasbon Terbuka* : ${money(total)}`, ''];
  for (const s of scores.slice(0, 8)) {
    lines.push(`- ${s.name}: ${money(s.debt)}`);
  }
  lines.push('', 'Ketik "tagih <nama>" untuk menyiapkan pengingat.');
  await sendText(message.from, lines.join('\n'));
  return { action: 'query_kasbon' };
}

async function answerStock(shop, message) {
  const rawName = extractProductName(message.text);
  if (!rawName) {
    await sendText(message.from, 'Mau cek stok barang apa? Contoh: "stok indomie".');
    return { action: 'query_stock_no_name' };
  }
  const { product } = await resolveProduct(
    { shopId: shop._id, rawName },
    { createIfMissing: false },
  );
  if (!product) {
    await sendText(message.from, `Produk "${rawName}" belum ada di katalog.`);
    return { action: 'query_stock_not_found' };
  }
  const low = product.reorderPoint != null && (product.stock ?? 0) <= product.reorderPoint;
  await sendText(
    message.from,
    `📦 Stok *${product.name}*: ${product.stock ?? 0}${product.unit ? ` ${product.unit}` : ''}${
      low ? ' (menipis)' : ''
    }.`,
  );
  return { action: 'query_stock' };
}

async function answerProductList(shop, message) {
  const products = await listDashboardProducts(shop);
  if (products.length === 0) {
    await sendText(
      message.from,
      'Belum ada produk di katalog. Catat barang dulu, contoh: "masuk 2 dus indomie 90000".',
    );
    return { action: 'query_product_list_empty' };
  }
  const lines = [`🛍️ *Daftar Produk* (${products.length}):`];
  for (const product of products.slice(0, 25)) {
    const price = product.sellPrice ? `, jual ${money(product.sellPrice)}` : '';
    const low = product.lowStock ? ' ⚠️' : '';
    lines.push(
      `- ${product.name} — stok ${product.stock}${product.unit ? ` ${product.unit}` : ''}${price}${low}`,
    );
  }
  if (products.length > 25) {
    lines.push(`…dan ${products.length - 25} lainnya (lihat semua di dashboard).`);
  }
  await sendText(message.from, lines.join('\n'));
  return { action: 'query_product_list' };
}

async function answerCrm(shop, message) {
  const preview = await previewProactiveCrm(shop);
  if (preview.customerReminders.length === 0) {
    await sendText(message.from, 'Belum ada pelanggan yang perlu diingatkan belanja hari ini.');
    return { action: 'query_crm' };
  }
  const lines = ['🔔 *Pelanggan untuk Diingatkan* :'];
  for (const reminder of preview.customerReminders.slice(0, 8)) {
    const digits = String(reminder.phone ?? '').replace(/\D/gu, '');
    const link = digits ? ` — wa.me/${digits}` : '';
    lines.push(`- ${reminder.name} (${reminder.productName})${link}`);
  }
  lines.push('', 'Klik nomornya untuk kirim lewat WhatsApp kamu.');
  await sendText(message.from, lines.join('\n'));
  return { action: 'query_crm' };
}

// Answer a free-form warung question. Data answers are deterministic; anything else falls
// back to the Gemini warung assistant (which never fabricates the shop's numbers).
export async function handleQuery({ shop, message }) {
  const query = classifyQuery(message.text);

  switch (query.type) {
    case 'profit':
      return answerProfit(shop, message, query.period);
    case 'sales':
      return answerSales(shop, message, query.period);
    case 'restock':
      return answerRestock(shop, message);
    case 'product_list':
      return answerProductList(shop, message);
    case 'crm':
      return answerCrm(shop, message);
    case 'kasbon':
      return answerKasbon(shop, message);
    case 'stock':
      return answerStock(shop, message);
    default: {
      const answer = await askWarungAssistant({ text: message.text });
      await sendText(
        message.from,
        answer ??
          'Aku belum paham 🙏. Coba tanya soal *stok*, *omzet*, *untung*, *kasbon*, atau ketik */bantuan* untuk daftar perintah.',
      );
      return { action: 'query_general' };
    }
  }
}
