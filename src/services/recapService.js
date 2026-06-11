import { sendText } from '../messaging/whatsapp.js';
import { getDailyRecap, getMonthlyRecap } from './analyticsService.js';
import { notifyOwner } from './broadcastService.js';

function formatMoney(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

const ESTIMATE_NOTE = '_*estimasi — sebagian harga modal belum diisi_';

// A tidy multi-line daily recap (WhatsApp *bold* for the header + labels).
export function formatDailyRecap(recap) {
  const lines = [
    `📊 *Rekap Hari Ini*`,
    `🗓️ ${recap.date}`,
    '',
    `💰 *Omzet* : ${formatMoney(recap.omzet)}`,
    `🧾 *Transaksi* : ${recap.txnCount}`,
    `🟢 *Laba bersih* : ${formatMoney(recap.profit)}${recap.hasUnknownCost ? ' *' : ''}`,
    `📒 *Kasbon baru* : ${formatMoney(recap.kasbonBaru)}`,
  ];

  if (recap.lowStock.length > 0) {
    lines.push(`📦 *Stok Menipis* :`);
    for (const name of recap.lowStock) {
      lines.push(`- ${name}`);
    }
  } else {
    lines.push(`📦 *Stok Menipis* : tidak ada`);
  }

  if (recap.hasUnknownCost) {
    lines.push('', ESTIMATE_NOTE);
  }

  return lines.join('\n');
}

export function formatMonthlyRecap(recap) {
  const lines = [
    `📊 *Rekap Bulanan* — ${recap.month}`,
    '',
    `💰 *Omzet* : ${formatMoney(recap.omzet)}`,
    `🧾 *Transaksi* : ${recap.txnCount}`,
    `🟢 *Laba bersih* : ${formatMoney(recap.profit)}${recap.hasUnknownCost ? ' *' : ''}`,
    `📒 *Kasbon baru* : ${formatMoney(recap.kasbonBaru)}`,
  ];

  if (recap.topItems.length > 0) {
    lines.push(`🏆 *Terlaris* :`);
    for (const item of recap.topItems) {
      lines.push(`- ${item.name} (${formatMoney(item.value)})`);
    }
  }

  if (recap.hasUnknownCost) {
    lines.push('', ESTIMATE_NOTE);
  }

  return lines.join('\n');
}

// On-demand daily recap (start of day → now). The scheduled daily evaluation still runs
// at its own time regardless of this command.
export function parseRecapCommand(text) {
  return /^\s*rekap(?:\s+(?:sekarang|hari\s*ini|harian|now))?\s*$/iu.test(String(text ?? ''));
}

// On-demand monthly report. "rekap bulanan", "laporan bulanan", "rekap bulan ini", etc.
export function parseMonthlyRecapCommand(text) {
  return /^\s*(?:rekap|laporan)\s+bulan(?:an|\s*ini)?\s*$/iu.test(String(text ?? ''));
}

export async function handleRecapCommand({ shop, message, now = new Date() }) {
  const recap = await getDailyRecap(shop, { now });
  await sendText(message.from, formatDailyRecap(recap));
  return { action: 'recap_now', recap };
}

export async function handleMonthlyRecapCommand({ shop, message, now = new Date() }) {
  const recap = await getMonthlyRecap(shop, { now });
  await sendText(message.from, formatMonthlyRecap(recap));
  return { action: 'recap_monthly', recap };
}

// Push the daily recap to the owner during the scheduled evaluation (owner-facing,
// unmetered). Returns whether it was sent.
export async function sendDailyRecap(shop, { now = new Date() } = {}) {
  const recap = await getDailyRecap(shop, { now });
  const result = await notifyOwner(shop, formatDailyRecap(recap));
  return { sent: result.sent, recap };
}
