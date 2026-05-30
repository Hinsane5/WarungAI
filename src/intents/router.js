import { sendText } from '../messaging/whatsapp.js';
import { confirmPendingTransaction, handleTextPos } from '../services/posService.js';
import { findOrCreateByOwnerPhone } from '../services/shopService.js';
import { getOrCreateSession } from '../services/sessionService.js';

const WELCOME_MESSAGE = [
  'Selamat datang di WarungAI.',
  'Warung kamu sudah terdaftar.',
  'Untuk mulai, kirim transaksi seperti: "masuk 2 dus indomie" atau "laku 1 galon aqua".',
  'Nanti setiap transaksi akan minta konfirmasi Y/T sebelum masuk buku.',
].join('\n');

export async function routeInboundMessage(message) {
  const { shop, created } = await findOrCreateByOwnerPhone({
    ownerPhone: message.from,
    ownerName: message.profileName,
  });
  const session = await getOrCreateSession({ shopId: shop._id, ownerPhone: message.from });

  if (created) {
    await sendText(message.from, WELCOME_MESSAGE);
    return { handled: true, action: 'onboarded', shopId: shop._id };
  }

  if (message.type !== 'text' || !message.text) {
    await sendText(message.from, 'Untuk saat ini, kirim pesan teks dulu ya.');
    return { handled: true, action: 'unsupported_message' };
  }

  if (session.state === 'awaiting_confirmation') {
    return confirmPendingTransaction({ shop, session, message });
  }

  if (session.state === 'fast_text_fallback') {
    await sendText(message.from, 'Gunakan format: <jual/masuk> <jumlah> <barang>.');
  }

  return handleTextPos({ shop, session, message });
}
