import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendTextMock = vi.hoisted(() => vi.fn());
const customerFindOneMock = vi.hoisted(() => vi.fn());
const customerCreateMock = vi.hoisted(() => vi.fn());
const shopFindOneMock = vi.hoisted(() => vi.fn());
const transactionFindOneMock = vi.hoisted(() => vi.fn());

vi.mock('../src/messaging/whatsapp.js', () => ({
  sendText: sendTextMock,
}));

vi.mock('../src/models/Customer.js', () => ({
  Customer: {
    findOne: customerFindOneMock,
    create: customerCreateMock,
  },
}));

vi.mock('../src/models/Shop.js', () => ({
  Shop: {
    findOne: shopFindOneMock,
  },
}));

vi.mock('../src/models/Transaction.js', () => ({
  Transaction: {
    findOne: transactionFindOneMock,
  },
}));

const { buildLoyaltyQrUrl, registerLoyaltyCustomer, resolveShopByLoyaltySlug } =
  await import('../src/services/loyaltyService.js');

function createShop(overrides = {}) {
  return {
    _id: 'shop-1',
    name: 'Warung Sri',
    loyaltyQrSlug: 'warung-static-slug',
    ...overrides,
  };
}

function createCustomer(overrides = {}) {
  return {
    _id: 'customer-1',
    shopId: 'shop-1',
    phone: '+628111222333',
    name: 'Budi',
    aliases: ['budi'],
    loyalty: {
      points: 1,
      stamps: 1,
      joinedVia: 'qr',
    },
    optInBroadcast: true,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createTransaction() {
  return {
    _id: 'txn-1',
    customerId: undefined,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('loyaltyService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T04:00:00.000Z'));
    sendTextMock.mockResolvedValue({ messages: [{ id: 'sent-1' }] });
    shopFindOneMock.mockResolvedValue(createShop());
    customerFindOneMock.mockResolvedValue(null);
    transactionFindOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('resolves shops by the static loyalty QR slug', async () => {
    const shop = createShop();
    shopFindOneMock.mockResolvedValue(shop);

    await expect(resolveShopByLoyaltySlug('warung-static-slug')).resolves.toBe(shop);
    expect(shopFindOneMock).toHaveBeenCalledWith({ loyaltyQrSlug: 'warung-static-slug' });
  });

  it('builds a static loyalty URL from public base URL and slug', () => {
    expect(buildLoyaltyQrUrl(createShop())).toBe('https://example.test/loyalty/warung-static-slug');
  });

  it('creates a loyalty customer, links a recent transaction, opts in, and sends stamp confirmation', async () => {
    const customer = createCustomer({ loyalty: { points: 1, stamps: 1, joinedVia: 'qr' } });
    const transaction = createTransaction();
    customerCreateMock.mockResolvedValue(customer);
    transactionFindOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(transaction),
      }),
    });

    const result = await registerLoyaltyCustomer({
      slug: 'warung-static-slug',
      phone: '0811-1222-333',
      name: 'Budi',
    });

    expect(customerCreateMock).toHaveBeenCalledWith({
      shopId: 'shop-1',
      phone: '+08111222333',
      name: 'Budi',
      loyalty: {
        points: 1,
        stamps: 1,
        joinedVia: 'qr',
      },
      optInBroadcast: true,
    });
    expect(transaction.customerId).toBe('customer-1');
    expect(transaction.save).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      '+08111222333',
      expect.stringContaining('Stamp digital: 1. Poin: 1.'),
    );
    expect(result).toMatchObject({
      ok: true,
      customer,
      linkedTransaction: transaction,
      loyaltyUrl: 'https://example.test/loyalty/warung-static-slug',
    });
  });

  it('attaches phone to an existing name-only customer instead of creating a duplicate', async () => {
    const customer = createCustomer({
      phone: undefined,
      loyalty: { points: 2, stamps: 2, joinedVia: 'manual' },
    });
    customerFindOneMock.mockResolvedValueOnce(null).mockResolvedValueOnce(customer);

    const result = await registerLoyaltyCustomer({
      slug: 'warung-static-slug',
      phone: '+628111222333',
      name: 'Budi',
    });

    expect(customerCreateMock).not.toHaveBeenCalled();
    expect(customer.phone).toBe('+628111222333');
    expect(customer.optInBroadcast).toBe(true);
    expect(customer.loyalty).toEqual({
      points: 3,
      stamps: 3,
      joinedVia: 'manual',
    });
    expect(customer.save).toHaveBeenCalledTimes(1);
    expect(result.customer).toBe(customer);
  });

  it('keeps registration successful when WhatsApp stamp confirmation fails', async () => {
    const customer = createCustomer({ loyalty: { points: 1, stamps: 1, joinedVia: 'qr' } });
    customerCreateMock.mockResolvedValue(customer);
    sendTextMock.mockRejectedValue(new Error('Meta send failed'));

    const result = await registerLoyaltyCustomer({
      slug: 'warung-static-slug',
      phone: '08111222333',
      name: 'Budi',
    });

    expect(customerCreateMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      customer,
      linkedTransaction: null,
    });
  });

  it('rejects unknown slugs and invalid phone numbers', async () => {
    shopFindOneMock.mockResolvedValueOnce(null);

    await expect(
      registerLoyaltyCustomer({ slug: 'missing', phone: '+628111222333' }),
    ).resolves.toEqual({ ok: false, reason: 'shop_not_found' });

    shopFindOneMock.mockResolvedValueOnce(createShop());

    await expect(
      registerLoyaltyCustomer({ slug: 'warung-static-slug', phone: '' }),
    ).resolves.toEqual({ ok: false, reason: 'invalid_phone' });
  });
});
