import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendTextMock = vi.hoisted(() => vi.fn());

vi.mock('../src/messaging/whatsapp.js', () => ({
  sendText: sendTextMock,
}));

const { notifyOwner, sendCustomerBroadcast } = await import('../src/services/broadcastService.js');

function createShop(balance = 5) {
  return {
    _id: 'shop-1',
    ownerPhone: '+628111',
    quotas: { koinBotBalance: balance, toObject: () => ({ koinBotBalance: balance }) },
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('broadcastService', () => {
  beforeEach(() => {
    sendTextMock.mockResolvedValue({ messages: [{ id: 'sent-1' }] });
  });
  afterEach(() => vi.clearAllMocks());

  describe('notifyOwner (unmetered)', () => {
    it('sends to the owner phone', async () => {
      const shop = createShop();
      await expect(notifyOwner(shop, 'hi')).resolves.toEqual({ sent: true });
      expect(sendTextMock).toHaveBeenCalledWith('+628111', 'hi');
      expect(shop.save).not.toHaveBeenCalled();
    });
    it('degrades gracefully on send failure', async () => {
      sendTextMock.mockRejectedValueOnce(new Error('blocked'));
      await expect(notifyOwner(createShop(), 'hi')).resolves.toEqual({
        sent: false,
        reason: 'send_failed',
      });
    });
  });

  describe('sendCustomerBroadcast (metered)', () => {
    it('skips customers without a phone', async () => {
      const r = await sendCustomerBroadcast({ shop: createShop(), customer: {}, text: 'x' });
      expect(r).toEqual({ sent: false, reason: 'no_phone' });
      expect(sendTextMock).not.toHaveBeenCalled();
    });

    it('skips opted-out customers', async () => {
      const r = await sendCustomerBroadcast({
        shop: createShop(),
        customer: { phone: '+628222', optInBroadcast: false },
        text: 'x',
      });
      expect(r).toEqual({ sent: false, reason: 'opted_out' });
      expect(sendTextMock).not.toHaveBeenCalled();
    });

    it('refuses when Koin Bot balance is exhausted', async () => {
      const r = await sendCustomerBroadcast({
        shop: createShop(0),
        customer: { phone: '+628222' },
        text: 'x',
      });
      expect(r).toEqual({ sent: false, reason: 'quota_exhausted' });
      expect(sendTextMock).not.toHaveBeenCalled();
    });

    it('sends and decrements the balance on success', async () => {
      const shop = createShop(3);
      const r = await sendCustomerBroadcast({
        shop,
        customer: { _id: 'c1', phone: '+628222' },
        text: 'halo',
      });
      expect(r).toEqual({ sent: true });
      expect(sendTextMock).toHaveBeenCalledWith('+628222', 'halo');
      expect(shop.quotas.koinBotBalance).toBe(2);
      expect(shop.save).toHaveBeenCalledTimes(1);
    });

    it('does not decrement the balance when the send fails', async () => {
      sendTextMock.mockRejectedValueOnce(new Error('blocked'));
      const shop = createShop(3);
      const r = await sendCustomerBroadcast({
        shop,
        customer: { _id: 'c1', phone: '+628222' },
        text: 'halo',
      });
      expect(r).toEqual({ sent: false, reason: 'send_failed' });
      expect(shop.save).not.toHaveBeenCalled();
    });
  });
});
