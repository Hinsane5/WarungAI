import { transcribeOggOpus } from '../ai/sttClient.js';
import { downloadMedia } from '../messaging/media.js';
import { sendText } from '../messaging/whatsapp.js';
import {
  approveKasbonReminder,
  draftKasbonReminder,
  handleKasbon,
  parseReminderCommand,
} from '../services/kasbonService.js';
import {
  confirmPendingTransaction,
  handleMissingPriceReply,
  handleTextPos,
} from '../services/posService.js';
import {
  handlePendingPriceUpdateReply,
  handlePriceUpdateCommand,
  parsePriceUpdateCommand,
} from '../services/priceCommandService.js';
import { handleScheduleCommand, parseScheduleCommand } from '../services/scheduleService.js';
import { findOrCreateByOwnerPhone } from '../services/shopService.js';
import {
  handlePromoOrderReply,
  handleStockCheck,
  parseStockCheckCommand,
} from '../services/stockCommandService.js';
import { getOrCreateSession } from '../services/sessionService.js';
import { logger } from '../utils/logger.js';

const WELCOME_MESSAGE = [
  'Selamat datang di WarungAI.',
  'Warung kamu sudah terdaftar.',
  'Untuk mulai, kirim transaksi seperti: "masuk 2 dus indomie" atau "laku 1 galon aqua".',
  'Ketik /bantuan untuk melihat daftar perintah.',
  'Nanti setiap transaksi akan minta konfirmasi Y/T sebelum masuk buku.',
].join('\n');

const HELP_MESSAGE = [
  'Daftar perintah WarungAI:',
  '- Catat stok masuk: "masuk 2 dus pocari 1 liter 120000"',
  '- Catat penjualan: "laku 1 galon aqua 20000"',
  '- Catat kasbon: "kasbon budi 2 rokok 50000"',
  '- Tagih kasbon: "tagih budi"',
  '- Cek stok + promo distributor: "cek stok indomie"',
  '- Cek/ubah jadwal evaluasi: "jadwal evaluasi" atau "jadwal evaluasi 19.00"',
  'Setiap transaksi akan minta konfirmasi Y/T sebelum disimpan.',
].join('\n');

function isHelpCommand(text) {
  return /^\s*\/?(?:bantuan|help)\s*$/iu.test(text);
}

async function handleAudioMessage({ shop, session, message }) {
  if (!message.audioMediaId && !message.audioBuffer) {
    await sendText(
      message.from,
      'Voice note tidak terbaca. Tolong kirim ulang atau ketik transaksinya.',
    );
    return { handled: true, action: 'audio_missing_media_id' };
  }

  let transcription;

  try {
    // Meta provides a media id to download; the n8n transport supplies the bytes directly.
    const audioBuffer = message.audioBuffer ?? (await downloadMedia(message.audioMediaId));
    transcription = await transcribeOggOpus(audioBuffer, { encoding: message.audioEncoding });
  } catch (error) {
    logger.warn(
      {
        err: error,
        messageId: message.messageId,
        audioMediaId: message.audioMediaId,
        from: message.from,
      },
      'Voice note media download or STT transcription failed',
    );
    await sendText(
      message.from,
      'Voice note belum bisa diproses. Tolong kirim ulang atau ketik transaksinya.',
    );
    return { handled: true, action: 'audio_transcription_failed' };
  }

  if (!transcription.transcript) {
    await sendText(
      message.from,
      'Voice note belum bisa ditranskrip. Tolong kirim ulang lebih jelas atau ketik transaksinya.',
    );
    return { handled: true, action: 'audio_empty_transcript' };
  }

  return handleTextPos({
    shop,
    session,
    message: {
      ...message,
      text: transcription.transcript,
      sttConfidence: transcription.confidence,
    },
  });
}

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

  // An earlier flow was abandoned and auto-cancelled — tell the owner it didn't complete,
  // then handle this message fresh (the session is already reset to idle).
  if (session.expiredNotice) {
    const notice = session.expiredNotice;
    session.expiredNotice = undefined;
    await session.save();
    await sendText(
      message.from,
      `Catatan: aksi "${notice}" sebelumnya belum selesai dan sudah dibatalkan karena tidak ada balasan. Datanya tidak berubah — mulai lagi kalau perlu ya.`,
    );
  }

  if (message.type === 'audio') {
    return handleAudioMessage({ shop, session, message });
  }

  if (message.type !== 'text' || !message.text) {
    await sendText(message.from, 'Untuk saat ini, kirim pesan teks dulu ya.');
    return { handled: true, action: 'unsupported_message' };
  }

  if (isHelpCommand(message.text)) {
    await sendText(message.from, HELP_MESSAGE);
    return { handled: true, action: 'help' };
  }

  if (session.state === 'awaiting_confirmation') {
    return confirmPendingTransaction({ shop, session, message });
  }

  if (session.state === 'clarifying' && session.context?.pendingPriceItem) {
    return handleMissingPriceReply({ shop, session, message });
  }

  if (session.state === 'clarifying' && session.context?.pendingPriceUpdate) {
    return handlePendingPriceUpdateReply({ shop, session, message });
  }

  if (session.state === 'awaiting_kasbon_reminder_approval') {
    return approveKasbonReminder({ shop, session, message });
  }

  if (session.state === 'awaiting_promo_order') {
    const handled = await handlePromoOrderReply({ shop, session, message });
    if (handled) {
      return handled;
    }
  }

  if (parseStockCheckCommand(message.text)) {
    return handleStockCheck({ shop, session, message });
  }

  if (parseScheduleCommand(message.text)) {
    return handleScheduleCommand({ shop, message });
  }

  if (/^\s*kasbon\b/iu.test(message.text)) {
    return handleKasbon({ shop, session, message });
  }

  if (parseReminderCommand(message.text)) {
    return draftKasbonReminder({ shop, session, message });
  }

  if (parsePriceUpdateCommand(message.text)) {
    return handlePriceUpdateCommand({ shop, session, message });
  }

  if (session.state === 'fast_text_fallback') {
    await sendText(message.from, 'Gunakan format: <jual/masuk> <jumlah> <barang>.');
  }

  return handleTextPos({ shop, session, message });
}
