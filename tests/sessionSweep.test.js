import { describe, expect, it, vi } from 'vitest';

const txnUpdateManyMock = vi.hoisted(() => vi.fn());
const sessionFindMock = vi.hoisted(() => vi.fn());

vi.mock('../src/models/Transaction.js', () => ({
  Transaction: { updateMany: txnUpdateManyMock },
}));
vi.mock('../src/models/Session.js', () => ({
  Session: { find: sessionFindMock },
}));

const { runSessionSweep } = await import('../src/jobs/sessionSweep.js');

describe('runSessionSweep', () => {
  it('cancels stale pending transactions and expires abandoned sessions', async () => {
    txnUpdateManyMock.mockResolvedValue({ modifiedCount: 2 });
    const session = {
      state: 'awaiting_confirmation',
      context: {},
      save: vi.fn().mockResolvedValue(undefined),
    };
    sessionFindMock.mockResolvedValue([session]);

    const result = await runSessionSweep({ now: new Date('2026-06-06T10:00:00.000Z') });

    // pending transactions older than the cutoff are cancelled
    expect(txnUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
      { $set: { status: 'cancelled' } },
    );
    // the abandoned session is expired (reset + notice) and saved
    expect(session.state).toBe('idle');
    expect(session.expiredNotice).toBe('konfirmasi transaksi');
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ transactionsCancelled: 2, sessionsExpired: 1 });
  });
});
