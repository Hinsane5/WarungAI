import { config } from '../config/index.js';
import { Session } from '../models/Session.js';
import { normalizePhone } from '../utils/phone.js';

function isStale(session, now = new Date()) {
  if (!session?.lastActivityAt) {
    return false;
  }

  const ttlMs = config.limits.sessionTtlMinutes * 60 * 1000;
  return now.getTime() - session.lastActivityAt.getTime() > ttlMs;
}

function idleContext() {
  return {
    pendingTransactionId: undefined,
    failureCount: 0,
    lastQuestion: undefined,
  };
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

  if (isStale(session)) {
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
  session.context = { ...session.context?.toObject?.(), ...context };
  session.lastActivityAt = new Date();
  await session.save();
  return session;
}
