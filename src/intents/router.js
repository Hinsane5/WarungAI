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
  cancelPendingFlow,
  confirmPendingTransaction,
  handleClarifyingReply,
  handleMissingPriceReply,
  handleTextPos,
} from '../services/posService.js';
import {
  handlePendingPriceUpdateReply,
  handlePriceUpdateCommand,
  parsePriceUpdateCommand,
} from '../services/priceCommandService.js';
import {
  buildWaRegistrationLink,
  parseDaftarCommand,
  registerLoyaltyByDaftar,
} from '../services/loyaltyService.js';
import { handleQuery, isAnsweredQuery } from '../services/queryService.js';
import {
  handleMonthlyRecapCommand,
  handleRecapCommand,
  parseMonthlyRecapCommand,
  parseRecapCommand,
} from '../services/recapService.js';
import { handleScheduleCommand, parseScheduleCommand } from '../services/scheduleService.js';
import { findOrCreateByOwnerPhone } from '../services/shopService.js';
import {
  handlePromoOrderReply,
  handleStockCheck,
  parseStockCheckCommand,
} from '../services/stockCommandService.js';
import { describePendingAction, getOrCreateSession } from '../services/sessionService.js';
import { logger } from '../utils/logger.js';

const WELCOME_MESSAGE = [
  '👋 *Selamat datang di WarungAI!*',
  'Warung kamu sudah terdaftar. ✅',
  '',
  'Cara mulai:',
  '• Stok masuk → _masuk 2 dus indomie_',
  '• Penjualan → _laku 1 galon aqua_',
  '',
  'Setiap transaksi minta konfirmasi *Y/T* dulu sebelum masuk buku.',
  'Ketik */bantuan* untuk semua perintah.',
].join('\n');

const HELP_MESSAGE = [
  '📖 *Daftar Perintah WarungAI*',
  '',
  '🛒 *Catat Transaksi*',
  '• Stok masuk → _masuk 2 dus pocari 120000_',
  '• Penjualan → _laku 1 galon aqua 20000_',
  '',
  '📒 *Kasbon*',
  '• Catat → _kasbon budi 2 rokok 50000_',
  '• Tagih → _tagih budi_',
  '• Total kasbon → _total kasbon berapa_',
  '',
  '📊 *Laporan & Tanya*',
  '• Rekap hari ini → _rekap sekarang_',
  '• Rekap bulanan → _rekap bulanan_',
  '• Laba bersih → _untung hari ini_ / _untung bulan ini_',
  '• Cek stok → _stok indomie_ atau _berapa sisa indomie_',
  '• Perlu restok → _barang apa yang perlu direstok_',
  '',
  '💬 Tanya bebas soal warung juga bisa, contoh: _gimana cara catat penjualan?_',
  '',
  '📍 *Lainnya*',
  '• Cek stok + promo distributor → _cek stok indomie_',
  '• Link daftar pelanggan → _qr loyalty_',
  '• Jadwal evaluasi → _jadwal evaluasi 19.00_',
  '',
  'Setiap transaksi minta konfirmasi *Y/T* sebelum disimpan.',
].join('\n');

function isHelpCommand(text) {
  return /^\s*\/?(?:bantuan|help)\s*$/iu.test(text);
}

// Owner asks for the customer-registration link/QR (the wa.me deep link).
function isLoyaltyLinkCommand(text) {
  return /^\s*(?:qr(?:\s+(?:loyalty|pelanggan|daftar))?|(?:link|kode)\s+(?:loyalty|pelanggan|daftar))\s*$/iu.test(
    text,
  );
}

const PENDING_STATES = new Set([
  'awaiting_confirmation',
  'awaiting_kasbon_reminder_approval',
  'awaiting_promo_order',
  'clarifying',
]);

function isCancelCommand(text) {
  return /^\s*batal\s*$/iu.test(text);
}

// A clearly-distinct command the owner could send mid-flow that should interrupt (cancel)
// the pending flow rather than be mistaken for an answer to it. Deliberately excludes bare
// POS verbs and short replies (numbers, Y/T, ya, jual/modal) that ARE valid continuations.
function isInterruptingCommand(text) {
  return Boolean(
    isHelpCommand(text) ||
      isLoyaltyLinkCommand(text) ||
      parseRecapCommand(text) ||
      parseMonthlyRecapCommand(text) ||
      parseScheduleCommand(text) ||
      parsePriceUpdateCommand(text) ||
      parseStockCheckCommand(text) ||
      parseReminderCommand(text) ||
      /^\s*kasbon\b/iu.test(text),
  );
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
  // A customer scanning the loyalty wa.me QR sends "DAFTAR <shop>". Handle this BEFORE owner
  // onboarding so a customer's number is never mistaken for (and onboarded as) a new shop.
  if (message.type === 'text' && message.text) {
    const daftar = parseDaftarCommand(message.text);
    if (daftar) {
      const result = await registerLoyaltyByDaftar({
        from: message.from,
        profileName: message.profileName,
        code: daftar.code,
      });
      if (result.ok) {
        // registerLoyaltyCustomer already sent the stamp confirmation to the customer.
        return { handled: true, action: 'loyalty_registered', customerId: result.customer._id };
      }
      await sendText(
        message.from,
        result.reason === 'missing_code'
          ? 'Untuk daftar loyalty, scan QR yang ada di warung ya.'
          : 'Maaf, kode warung tidak ditemukan. Pastikan scan QR dari warung yang benar.',
      );
      return { handled: true, action: 'loyalty_register_failed', reason: result.reason };
    }
  }

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
      `Catatan: ${notice} sebelumnya belum selesai dan otomatis dibatalkan karena tidak ada balasan. Datanya tidak berubah. Kalau mau lanjut, kirim ulang transaksinya ya.`,
    );
  }

  if (message.type === 'audio') {
    return handleAudioMessage({ shop, session, message });
  }

  if (message.type !== 'text' || !message.text) {
    await sendText(message.from, 'Untuk saat ini, kirim pesan teks dulu ya.');
    return { handled: true, action: 'unsupported_message' };
  }

  // Interruptible flows: let the owner escape a half-finished flow instead of being stuck
  // re-answering the same question. "batal" cancels; a clearly-different command cancels the
  // old flow and proceeds to the new one.
  if (PENDING_STATES.has(session.state)) {
    if (isCancelCommand(message.text)) {
      const label = describePendingAction(session);
      await cancelPendingFlow({ session });
      await sendText(message.from, `Oke, aksi "${label}" dibatalkan. Datanya tidak berubah.`);
      return { handled: true, action: 'pending_cancelled' };
    }
    if (isInterruptingCommand(message.text)) {
      const label = describePendingAction(session);
      await cancelPendingFlow({ session });
      await sendText(
        message.from,
        `Aksi "${label}" sebelumnya dibatalkan — lanjut ke perintah baru ya.`,
      );
      // fall through: the session is idle now, so the new command is handled below.
    }
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

  // A reply to a free-form AI clarification (POS): re-run extraction on the original
  // message + this answer combined, instead of parsing the answer in isolation.
  if (session.state === 'clarifying' && session.context?.clarifyingText) {
    return handleClarifyingReply({ shop, session, message });
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

  if (isLoyaltyLinkCommand(message.text)) {
    const link = buildWaRegistrationLink(shop);
    await sendText(
      message.from,
      link
        ? [
            '🔗 *Link Daftar Pelanggan*',
            'Bagikan atau print link/QR ini. Pelanggan tinggal buka → kirim → otomatis terdaftar:',
            link,
          ].join('\n')
        : 'Nomor bot WhatsApp belum diatur, jadi link daftar pelanggan belum bisa dibuat.',
    );
    return { handled: true, action: 'loyalty_link' };
  }

  if (parseRecapCommand(message.text)) {
    return handleRecapCommand({ shop, message });
  }

  if (parseMonthlyRecapCommand(message.text)) {
    return handleMonthlyRecapCommand({ shop, message });
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

  // Data questions the bot can answer deterministically (stok, omzet, untung, kasbon,
  // restok, CRM) — handled here without an AI extraction call.
  if (isAnsweredQuery(message.text)) {
    return handleQuery({ shop, message });
  }

  if (session.state === 'fast_text_fallback') {
    await sendText(message.from, 'Gunakan format: <jual/masuk> <jumlah> <barang>.');
  }

  return handleTextPos({ shop, session, message });
}
