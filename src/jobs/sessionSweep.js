import { config } from '../config/index.js';
import { Session } from '../models/Session.js';
import { Transaction } from '../models/Transaction.js';
import { expireSession } from '../services/sessionService.js';
import { logger } from '../utils/logger.js';

// Runs on the scheduler tick: clean up abandoned in-flight work so it never lingers or
// misleads the owner. (1) cancel never-confirmed pending transactions, (2) expire stale
// mid-flow sessions — the "didn't complete" notice is delivered on the owner's next message.
export async function runSessionSweep({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - config.limits.pendingTtlMinutes * 60 * 1000);

  const cancelled = await Transaction.updateMany(
    { status: 'pending', createdAt: { $lt: cutoff } },
    { $set: { status: 'cancelled' } },
  );

  const staleSessions = await Session.find({
    state: { $ne: 'idle' },
    lastActivityAt: { $lt: cutoff },
  });
  for (const session of staleSessions) {
    expireSession(session);
    await session.save();
  }

  const result = {
    transactionsCancelled: cancelled.modifiedCount ?? 0,
    sessionsExpired: staleSessions.length,
  };
  if (result.transactionsCancelled || result.sessionsExpired) {
    logger.info(result, 'session sweep complete');
  }
  return result;
}
