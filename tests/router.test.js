import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findOrCreateByOwnerPhoneMock = vi.hoisted(() => vi.fn());
const getOrCreateSessionMock = vi.hoisted(() => vi.fn());
const sendTextMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/shopService.js', () => ({
  findOrCreateByOwnerPhone: findOrCreateByOwnerPhoneMock,
}));

vi.mock('../src/services/sessionService.js', () => ({
  getOrCreateSession: getOrCreateSessionMock,
}));

vi.mock('../src/messaging/whatsapp.js', () => ({
  sendText: sendTextMock,
}));

const { routeInboundMessage } = await import('../src/intents/router.js');

describe('routeInboundMessage', () => {
  beforeEach(() => {
    findOrCreateByOwnerPhoneMock.mockResolvedValue({
      shop: { _id: 'shop-1' },
      created: false,
    });
    getOrCreateSessionMock.mockResolvedValue({ _id: 'session-1' });
    sendTextMock.mockResolvedValue({ messages: [{ id: 'sent-1' }] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates shop/session context and welcomes a first-time sender', async () => {
    findOrCreateByOwnerPhoneMock.mockResolvedValue({
      shop: { _id: 'shop-1' },
      created: true,
    });

    const result = await routeInboundMessage({
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'halo',
    });

    expect(findOrCreateByOwnerPhoneMock).toHaveBeenCalledWith({
      ownerPhone: '+6281234567890',
      ownerName: 'Bu Sri',
    });
    expect(getOrCreateSessionMock).toHaveBeenCalledWith({
      shopId: 'shop-1',
      ownerPhone: '+6281234567890',
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('Warung kamu sudah terdaftar'),
    );
    expect(result).toEqual({ handled: true, action: 'onboarded', shopId: 'shop-1' });
  });

  it('echoes existing text senders until POS routing lands in Phase 3', async () => {
    await routeInboundMessage({
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'cek',
    });

    expect(sendTextMock).toHaveBeenCalledWith('+6281234567890', 'Anda menulis: cek');
  });
});
