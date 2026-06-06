import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionFindOneMock = vi.hoisted(() => vi.fn());
const sessionCreateMock = vi.hoisted(() => vi.fn());

vi.mock('../src/models/Session.js', () => ({
  Session: {
    findOne: sessionFindOneMock,
    create: sessionCreateMock,
  },
}));

const { getOrCreateSession, isSessionStale, setSessionState } =
  await import('../src/services/sessionService.js');

function createSession(overrides = {}) {
  return {
    shopId: 'shop-old',
    ownerPhone: '+6281234567890',
    state: 'idle',
    context: { failureCount: 0 },
    lastActivityAt: new Date(),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('sessionService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('checks the stale-session boundary against configured TTL', () => {
    expect(
      isSessionStale(
        { lastActivityAt: new Date('2026-05-30T09:00:00.000Z') },
        new Date('2026-05-30T10:00:00.000Z'),
      ),
    ).toBe(false);
    expect(
      isSessionStale(
        { lastActivityAt: new Date('2026-05-30T08:59:59.999Z') },
        new Date('2026-05-30T10:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('creates a new idle session when none exists', async () => {
    const createdSession = createSession({ _id: 'session-1' });
    sessionFindOneMock.mockResolvedValue(null);
    sessionCreateMock.mockResolvedValue(createdSession);

    const result = await getOrCreateSession({
      shopId: 'shop-1',
      ownerPhone: '6281234567890',
    });

    expect(sessionCreateMock).toHaveBeenCalledWith({
      shopId: 'shop-1',
      ownerPhone: '+6281234567890',
      state: 'idle',
      context: {
        pendingTransactionId: undefined,
        failureCount: 0,
        lastQuestion: undefined,
      },
      lastActivityAt: new Date('2026-05-30T10:00:00.000Z'),
    });
    expect(result).toBe(createdSession);
  });

  it('refreshes and saves a recently active pending session', async () => {
    const session = createSession({
      shopId: 'shop-old',
      state: 'awaiting_confirmation',
      lastActivityAt: new Date('2026-05-30T09:55:00.000Z'), // 5 min ago, within pending TTL
    });
    sessionFindOneMock.mockResolvedValue(session);

    const result = await getOrCreateSession({
      shopId: 'shop-new',
      ownerPhone: '+6281234567890',
    });

    expect(result).toBe(session);
    expect(session.shopId).toBe('shop-new');
    expect(session.state).toBe('awaiting_confirmation');
    expect(session.lastActivityAt).toEqual(new Date('2026-05-30T10:00:00.000Z'));
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('expires an abandoned mid-flow session and records the notice', async () => {
    const session = createSession({
      state: 'clarifying',
      context: { pendingPriceUpdate: { productName: 'Aqua Galon 19L' } },
      lastActivityAt: new Date('2026-05-30T09:45:00.000Z'), // 15 min ago, past pending TTL
    });
    sessionFindOneMock.mockResolvedValue(session);

    await getOrCreateSession({ shopId: 'shop-1', ownerPhone: '+6281234567890' });

    expect(session.state).toBe('idle');
    expect(session.expiredNotice).toBe('ubah harga Aqua Galon 19L');
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('resets a stale existing session to idle', async () => {
    const session = createSession({
      state: 'awaiting_confirmation',
      context: { pendingTransactionId: 'txn-1', failureCount: 1, lastQuestion: 'Benar?' },
      lastActivityAt: new Date('2026-05-30T08:00:00.000Z'),
    });
    sessionFindOneMock.mockResolvedValue(session);

    await getOrCreateSession({
      shopId: 'shop-1',
      ownerPhone: '+6281234567890',
    });

    expect(session.state).toBe('idle');
    expect(session.context).toEqual({
      pendingTransactionId: undefined,
      failureCount: 0,
      lastQuestion: undefined,
    });
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('merges context when setting session state', async () => {
    const session = createSession({
      context: {
        toObject: () => ({ failureCount: 1, lastQuestion: 'Apa yang salah?' }),
      },
    });

    const result = await setSessionState(session, 'correcting', { failureCount: 2 });

    expect(result).toBe(session);
    expect(session.state).toBe('correcting');
    expect(session.context).toEqual({
      failureCount: 2,
      lastQuestion: 'Apa yang salah?',
    });
    expect(session.lastActivityAt).toEqual(new Date('2026-05-30T10:00:00.000Z'));
    expect(session.save).toHaveBeenCalledTimes(1);
  });
});
