import { sendText } from '../messaging/whatsapp.js';
import { getDailyRecap } from './analyticsService.js';
import { notifyOwner } from './broadcastService.js';

function formatMoney(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

// A tidy multi-line recap (WhatsApp *bold* for the header + labels).
export function formatDailyRecap(recap) {
  const lines = [
    `📊 *Rekap Hari Ini*`,
    `🗓️ ${recap.date}`,
    '',
    `💰 *Omzet* : ${formatMoney(recap.omzet)}`,
    `🧾 *Transaksi* : ${recap.txnCount}`,
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

  return lines.join('\n');
}

// Owner command for an on-demand recap (start of day → now). Distinct from the scheduled
// daily evaluation, which still runs at its own time regardless of this command.
export function parseRecapCommand(text) {
  return /^\s*rekap(?:\s+(?:sekarang|hari\s*ini|harian|now))?\s*$/iu.test(String(text ?? ''));
}

export async function handleRecapCommand({ shop, message, now = new Date() }) {
  const recap = await getDailyRecap(shop, { now });
  await sendText(message.from, formatDailyRecap(recap));
  return { action: 'recap_now', recap };
}

// Push the daily recap to the owner during the scheduled evaluation (owner-facing,
// unmetered). Returns whether it was sent.
export async function sendDailyRecap(shop, { now = new Date() } = {}) {
  const recap = await getDailyRecap(shop, { now });
  const result = await notifyOwner(shop, formatDailyRecap(recap));
  return { sent: result.sent, recap };
}
