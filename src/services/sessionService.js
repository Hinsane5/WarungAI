import { config } from '../config/index.js';
import { Session } from '../models/Session.js';
import { normalizePhone } from '../utils/phone.js';

export function isSessionStale(session, now = new Date()) {
  if (!session?.lastActivityAt) {
    return false;
  }

  const ttlMs = config.limits.sessionTtlMinutes * 60 * 1000;
  return now.getTime() - session.lastActivityAt.getTime() > ttlMs;
}

// A multi-step flow (state !== idle) that hasn't been answered within the (shorter) pending
// TTL — the owner walked away mid-action.
export function isSessionPendingStale(session, now = new Date()) {
  if (!session?.lastActivityAt || session.state === 'idle') {
    return false;
  }
  const ttlMs = config.limits.pendingTtlMinutes * 60 * 1000;
  return now.getTime() - session.lastActivityAt.getTime() > ttlMs;
}

function plainContext(context) {
  return context?.toObject?.() ?? context ?? {};
}

// Human label for the action the owner abandoned (used in the "it didn't complete" notice).
export function describePendingAction(session) {
  const ctx = plainContext(session.context);
  switch (session.state) {
    case 'awaiting_confirmation':
      return ctx.pendingSummary
        ? `konfirmasi transaksi ${ctx.pendingSummary}`
        : 'konfirmasi transaksi';
    case 'awaiting_kasbon_reminder_approval':
      return 'kirim pengingat kasbon';
    case 'awaiting_promo_order':
      return ctx.pendingPromoOrder?.brand
        ? `pesan promo ${ctx.pendingPromoOrder.brand}`
        : 'pesan promo';
    case 'clarifying':
      if (ctx.pendingPriceUpdate) {
        return ctx.pendingPriceUpdate.productName
          ? `ubah harga ${ctx.pendingPriceUpdate.productName}`
          : 'ubah harga';
      }
      if (ctx.pendingPriceItem) {
        return ctx.pendingPriceItem.rawName
          ? `catat "${ctx.pendingPriceItem.rawName}"`
          : 'catat transaksi';
      }
      return ctx.clarifyingText ? `transaksi "${ctx.clarifyingText}"` : 'lanjutkan transaksi';
    default:
      return 'lanjutkan transaksi';
  }
}

function idleContext() {
  return {
    pendingTransactionId: undefined,
    failureCount: 0,
    lastQuestion: undefined,
    clarifyingText: undefined,
    pendingSummary: undefined,
    pendingPriceItem: undefined,
    pendingPriceUpdate: undefined,
    pendingPromoOrder: undefined,
  };
}

// Cancel an abandoned flow in-memory: record what it was, reset to idle, clear context.
// Caller persists (save). The notice is delivered on the owner's next message.
export function expireSession(session) {
  session.expiredNotice = describePendingAction(session);
  session.state = 'idle';
  session.context = idleContext();
  return session;
}

export async function getOrCreateSession({ shopId, ownerPhone }) {
  const normalizedOwnerPhone = normalizePhone(ownerPhone);
  let session = await Session.findOne({ ownerPhone: normalizedOwnerPhone });

  if (!session) {
    session = await Session.create({
      shopId,
      ownerPhone: normalizedOwnerPhone,
      state: 'idle',
      context: idleContext(),
      lastActivityAt: new Date(),
    });

    return session;
  }

  if (isSessionPendingStale(session)) {
    // Abandoned mid-flow: cancel it and remember to tell the owner it didn't complete.
    expireSession(session);
  } else if (isSessionStale(session)) {
    session.state = 'idle';
    session.context = idleContext();
  }

  session.shopId = shopId;
  session.lastActivityAt = new Date();
  await session.save();

  return session;
}

export async function setSessionState(session, state, context = {}) {
  session.state = state;
  session.context = { ...plainContext(session.context), ...context };
  session.lastActivityAt = new Date();
  await session.save();
  return session;
}
