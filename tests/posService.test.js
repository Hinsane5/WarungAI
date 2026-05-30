import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const extractEntitiesMock = vi.hoisted(() => vi.fn());
const sendTextMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());
const transactionFindOneMock = vi.hoisted(() => vi.fn());
const productFindByIdMock = vi.hoisted(() => vi.fn());
const resolveProductMock = vi.hoisted(() => vi.fn());
const learnAliasMock = vi.hoisted(() => vi.fn());
const setSessionStateMock = vi.hoisted(() => vi.fn());
const mongoTransactionMock = vi.hoisted(() => vi.fn());

vi.mock('mongoose', () => ({
  default: {
    connection: {
      transaction: mongoTransactionMock,
    },
  },
}));

vi.mock('../src/ai/extractor.js', () => ({
  extractEntities: extractEntitiesMock,
}));

vi.mock('../src/messaging/whatsapp.js', () => ({
  sendText: sendTextMock,
}));

vi.mock('../src/models/Transaction.js', () => ({
  Transaction: {
    create: transactionCreateMock,
    findOne: transactionFindOneMock,
  },
}));

vi.mock('../src/models/Product.js', () => ({
  Product: {
    findById: productFindByIdMock,
  },
}));

vi.mock('../src/services/productService.js', () => ({
  resolveProduct: resolveProductMock,
  learnAlias: learnAliasMock,
}));

vi.mock('../src/services/sessionService.js', () => ({
  setSessionState: setSessionStateMock,
}));

const { confirmPendingTransaction, handleTextPos } = await import('../src/services/posService.js');

function createProduct(overrides = {}) {
  const product = {
    _id: overrides._id ?? 'product-1',
    name: overrides.name ?? 'Indomie Goreng',
    unit: overrides.unit ?? 'pcs',
    stock: overrides.stock ?? 10,
    sellPrice: overrides.sellPrice,
    costPrice: overrides.costPrice,
    aliases: overrides.aliases ?? [],
    save: vi.fn().mockResolvedValue(undefined),
  };
  product.session = vi.fn().mockResolvedValue(product);
  return product;
}

function createShop(overrides = {}) {
  return {
    _id: 'shop-1',
    tier: 'free',
    quotas: {
      dailyTxnDate: '2026-05-30',
      dailyTxnCount: 0,
      toObject: () => ({ dailyTxnDate: '2026-05-30', dailyTxnCount: 0 }),
    },
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createSession(overrides = {}) {
  return {
    _id: 'session-1',
    state: 'idle',
    context: { failureCount: 0 },
    ...overrides,
  };
}

describe('posService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-31T04:00:00.000Z'));
    sendTextMock.mockResolvedValue({ messages: [{ id: 'sent-1' }] });
    setSessionStateMock.mockImplementation(async (session, state, context) => {
      session.state = state;
      session.context = { ...(session.context ?? {}), ...context };
      return session;
    });
    mongoTransactionMock.mockImplementation(async (callback) => callback('mongo-session'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates a pending transaction and asks for Y/T confirmation', async () => {
    const product = createProduct({ _id: 'product-1', name: 'Indomie Goreng', costPrice: 100000 });
    resolveProductMock.mockResolvedValue({ product, rawName: 'indomie', created: false });
    extractEntitiesMock.mockResolvedValue({
      intent: 'pos',
      items: [{ rawName: 'indomie', qty: 2, unit: 'dus', unitPrice: null, action: 'stock_in' }],
      confidence: 0.9,
      needsClarification: false,
    });
    transactionCreateMock.mockImplementation(async (payload) => ({
      _id: 'txn-1',
      ...payload,
    }));
    const shop = createShop();
    const session = createSession();

    const result = await handleTextPos({
      shop,
      session,
      message: {
        from: '+6281234567890',
        type: 'text',
        text: 'masuk 2 dus indomie',
        messageId: 'wamid-1',
      },
    });

    expect(transactionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        type: 'stock_in',
        status: 'pending',
        whatsappMessageId: 'wamid-1',
        cashDelta: -200000,
      }),
    );
    expect(setSessionStateMock).toHaveBeenCalledWith(session, 'awaiting_confirmation', {
      pendingTransactionId: 'txn-1',
      failureCount: 0,
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('Benar? Balas Y / T'),
    );
    expect(result.action).toBe('pending_confirmation');
  });

  it('asks for price instead of recording a zero-rupiah sale', async () => {
    const product = createProduct({
      _id: 'product-1',
      name: 'Aqua Galon',
      sellPrice: undefined,
      costPrice: undefined,
    });
    resolveProductMock.mockResolvedValue({ product, rawName: 'aqua', created: false });
    extractEntitiesMock.mockResolvedValue({
      intent: 'pos',
      items: [{ rawName: 'aqua', qty: 1, unit: 'galon', unitPrice: null, action: 'sale' }],
      confidence: 0.9,
      needsClarification: false,
    });
    const session = createSession();

    const result = await handleTextPos({
      shop: createShop(),
      session,
      message: {
        from: '+6281234567890',
        type: 'text',
        text: 'laku 1 galon aqua',
        messageId: 'wamid-price',
      },
    });

    expect(transactionCreateMock).not.toHaveBeenCalled();
    expect(setSessionStateMock).toHaveBeenCalledWith(session, 'clarifying', {
      lastQuestion: expect.stringContaining('Harga Aqua Galon berapa?'),
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('Kirim ulang dengan harga'),
    );
    expect(result.action).toBe('clarifying_missing_price');
  });

  it('commits a pending transaction on Y and updates product stock plus cash delta', async () => {
    const product = createProduct({ _id: 'product-1', stock: 5 });
    const transaction = {
      _id: 'txn-1',
      shopId: 'shop-1',
      status: 'pending',
      cashDelta: 6000,
      items: [
        {
          productId: 'product-1',
          name: 'Indomie Goreng',
          rawName: 'indomie',
          qty: 2,
          unit: 'pcs',
          action: 'sale',
          unitPrice: 3000,
          lineTotal: 6000,
        },
      ],
      save: vi.fn().mockResolvedValue(undefined),
    };
    transactionFindOneMock.mockResolvedValue(transaction);
    productFindByIdMock.mockReturnValue(product);
    learnAliasMock.mockResolvedValue(product);
    const shop = createShop();
    const session = createSession({
      state: 'awaiting_confirmation',
      context: { pendingTransactionId: 'txn-1', failureCount: 0 },
    });

    const result = await confirmPendingTransaction({
      shop,
      session,
      message: { from: '+6281234567890', text: 'Y' },
    });

    expect(product.stock).toBe(3);
    expect(product.save).toHaveBeenCalledWith({ session: 'mongo-session' });
    expect(transaction.status).toBe('committed');
    expect(transaction.committedAt).toBeInstanceOf(Date);
    expect(transaction.save).toHaveBeenCalledWith({ session: 'mongo-session' });
    expect(shop.quotas.dailyTxnCount).toBe(1);
    expect(learnAliasMock).toHaveBeenCalledWith(product, 'indomie');
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('Tersimpan'),
    );
    expect(result.action).toBe('committed');
  });

  it('cancels a pending transaction on T and offers fast-text fallback after two failures', async () => {
    const transaction = {
      status: 'pending',
      save: vi.fn().mockResolvedValue(undefined),
    };
    transactionFindOneMock.mockResolvedValue(transaction);
    const shop = createShop();
    const session = createSession({
      state: 'awaiting_confirmation',
      context: { pendingTransactionId: 'txn-1', failureCount: 1 },
    });

    const result = await confirmPendingTransaction({
      shop,
      session,
      message: { from: '+6281234567890', text: 'T' },
    });

    expect(transaction.status).toBe('cancelled');
    expect(transaction.save).toHaveBeenCalledTimes(1);
    expect(setSessionStateMock).toHaveBeenCalledWith(session, 'fast_text_fallback', {
      pendingTransactionId: undefined,
      failureCount: 2,
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('Ketik: <jual/masuk>'),
    );
    expect(result.action).toBe('fast_text_fallback');
  });
});
