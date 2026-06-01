import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const extractEntitiesMock = vi.hoisted(() => vi.fn());
const sendTextMock = vi.hoisted(() => vi.fn());
const customerFindOneMock = vi.hoisted(() => vi.fn());
const customerCreateMock = vi.hoisted(() => vi.fn());
const kasbonFindMock = vi.hoisted(() => vi.fn());
const kasbonFindOneMock = vi.hoisted(() => vi.fn());
const kasbonCreateMock = vi.hoisted(() => vi.fn());
const resolveProductMock = vi.hoisted(() => vi.fn());
const setSessionStateMock = vi.hoisted(() => vi.fn());

vi.mock('../src/ai/extractor.js', () => ({
  extractEntities: extractEntitiesMock,
}));

vi.mock('../src/messaging/whatsapp.js', () => ({
  sendText: sendTextMock,
}));

vi.mock('../src/models/Customer.js', () => ({
  Customer: {
    findOne: customerFindOneMock,
    create: customerCreateMock,
  },
}));

vi.mock('../src/models/Kasbon.js', () => ({
  Kasbon: {
    find: kasbonFindMock,
    findOne: kasbonFindOneMock,
    create: kasbonCreateMock,
  },
}));

vi.mock('../src/services/productService.js', () => ({
  resolveProduct: resolveProductMock,
}));

vi.mock('../src/services/sessionService.js', () => ({
  setSessionState: setSessionStateMock,
}));

const {
  approveKasbonReminder,
  computeCreditScore,
  draftKasbonReminder,
  handleKasbon,
  recordKasbonPayment,
} = await import('../src/services/kasbonService.js');

function createCustomer(overrides = {}) {
  return {
    _id: 'customer-1',
    shopId: 'shop-1',
    name: 'Budi',
    aliases: ['budi'],
    phone: '+628111',
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createSession(overrides = {}) {
  return {
    _id: 'session-1',
    state: 'idle',
    context: {},
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createShop(overrides = {}) {
  return {
    _id: 'shop-1',
    name: 'Warung Sri',
    ...overrides,
  };
}

describe('kasbonService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T03:00:00.000Z'));
    sendTextMock.mockResolvedValue({ messages: [{ id: 'sent-1' }] });
    kasbonFindOneMock.mockResolvedValue(null);
    setSessionStateMock.mockImplementation(async (session, state, context) => {
      session.state = state;
      session.context = { ...(session.context ?? {}), ...context };
      return session;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('computes deterministic credit score from outstanding overdue kasbon', async () => {
    kasbonFindMock.mockResolvedValue([
      {
        status: 'open',
        amount: 100000,
        dueDate: new Date('2026-05-22T00:00:00.000Z'),
        payments: [],
      },
      {
        status: 'settled',
        amount: 0,
        dueDate: new Date('2026-05-01T00:00:00.000Z'),
        payments: [{ amount: 50000 }],
      },
    ]);

    const score = await computeCreditScore({
      customerId: 'customer-1',
      now: new Date('2026-06-01T03:00:00.000Z'),
    });

    expect(score).toEqual({
      value: 1000000,
      band: 'risky',
      inputs: {
        totalOutstanding: 100000,
        daysOverdue: 10,
        repaymentFrequency: 1,
      },
    });
  });

  it('records kasbon, links a customer, sends customer detail, and warns owner on risky score', async () => {
    const customer = createCustomer();
    const createdKasbon = {
      _id: 'kasbon-new',
      shopId: 'shop-1',
      customerId: 'customer-1',
      status: 'open',
      items: [{ name: 'Rokok', qty: 2, unit: null, unitPrice: 25000, lineTotal: 50000 }],
      amount: 50000,
      originalAmount: 50000,
    };
    customerFindOneMock.mockResolvedValueOnce(null);
    customerCreateMock.mockResolvedValue(customer);
    resolveProductMock.mockResolvedValue({
      product: { _id: 'product-1', name: 'Rokok', sellPrice: 25000, unit: null },
      rawName: 'rokok',
      created: false,
    });
    extractEntitiesMock.mockResolvedValue({
      intent: 'kasbon',
      customerRef: 'budi',
      items: [{ rawName: 'rokok', qty: 2, unit: null, unitPrice: null, action: 'sale' }],
      confidence: 0.9,
      needsClarification: false,
      clarificationQuestion: null,
    });
    kasbonCreateMock.mockResolvedValue(createdKasbon);
    kasbonFindMock.mockResolvedValue([
      createdKasbon,
      {
        status: 'open',
        amount: 100000,
        dueDate: new Date('2026-05-22T00:00:00.000Z'),
        payments: [],
      },
    ]);
    const session = createSession();

    const result = await handleKasbon({
      shop: createShop(),
      session,
      message: {
        from: '+628999',
        text: 'kasbon budi 2 rokok',
      },
    });

    expect(customerCreateMock).toHaveBeenCalledWith({
      shopId: 'shop-1',
      name: 'Budi',
      aliases: ['budi'],
      loyalty: { joinedVia: 'manual' },
    });
    expect(kasbonCreateMock).toHaveBeenCalledWith({
      shopId: 'shop-1',
      customerId: 'customer-1',
      status: 'open',
      items: [{ name: 'Rokok', qty: 2, unit: null, unitPrice: 25000, lineTotal: 50000 }],
      amount: 50000,
      originalAmount: 50000,
    });
    expect(customer.save).toHaveBeenCalledTimes(1);
    expect(customer.creditScore).toMatchObject({ band: 'risky' });
    expect(sendTextMock).toHaveBeenCalledWith(
      '+628111',
      expect.stringContaining('Info kasbon dari Warung Sri'),
    );
    expect(sendTextMock).toHaveBeenCalledWith(
      '+628999',
      expect.stringContaining('Peringatan: Budi masuk kategori risky'),
    );
    expect(result.action).toBe('kasbon_recorded');
  });

  it('updates an existing open kasbon for the same customer', async () => {
    const customer = createCustomer();
    const existingKasbon = {
      _id: 'kasbon-open',
      shopId: 'shop-1',
      customerId: 'customer-1',
      status: 'open',
      items: [{ name: 'Kopi', qty: 1, unit: null, unitPrice: 5000, lineTotal: 5000 }],
      amount: 5000,
      originalAmount: 5000,
      save: vi.fn().mockResolvedValue(undefined),
    };
    customerFindOneMock.mockResolvedValueOnce(customer);
    kasbonFindOneMock.mockResolvedValueOnce(existingKasbon);
    resolveProductMock.mockResolvedValue({
      product: { _id: 'product-1', name: 'Rokok', sellPrice: 25000, unit: null },
      rawName: 'rokok',
      created: false,
    });
    extractEntitiesMock.mockResolvedValue({
      intent: 'kasbon',
      customerRef: 'budi',
      items: [{ rawName: 'rokok', qty: 2, unit: null, unitPrice: null, action: 'sale' }],
      confidence: 0.9,
      needsClarification: false,
      clarificationQuestion: null,
    });
    kasbonFindMock.mockResolvedValue([existingKasbon]);

    const result = await handleKasbon({
      shop: createShop(),
      session: createSession(),
      message: {
        from: '+628999',
        text: 'kasbon budi 2 rokok',
      },
    });

    expect(kasbonCreateMock).not.toHaveBeenCalled();
    expect(existingKasbon.items).toEqual([
      { name: 'Kopi', qty: 1, unit: null, unitPrice: 5000, lineTotal: 5000 },
      { name: 'Rokok', qty: 2, unit: null, unitPrice: 25000, lineTotal: 50000 },
    ]);
    expect(existingKasbon.amount).toBe(55000);
    expect(existingKasbon.originalAmount).toBe(55000);
    expect(existingKasbon.save).toHaveBeenCalledTimes(1);
    expect(result.kasbon).toBe(existingKasbon);
  });

  it('drafts a reminder for owner approval without sending it to the customer', async () => {
    const customer = createCustomer();
    const kasbon = { _id: 'kasbon-1', amount: 70000 };
    customerFindOneMock.mockResolvedValue(customer);
    kasbonFindMock.mockResolvedValue([kasbon]);
    const session = createSession();

    const result = await draftKasbonReminder({
      shop: createShop(),
      session,
      message: { from: '+628999', text: 'tagih budi' },
    });

    expect(setSessionStateMock).toHaveBeenCalledWith(
      session,
      'awaiting_kasbon_reminder_approval',
      expect.objectContaining({
        reminderCustomerId: 'customer-1',
        reminderKasbonIds: ['kasbon-1'],
        reminderMessage: expect.stringMatching(/Total yang masih terbuka: Rp\s?70\.000/u),
      }),
    );
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith('+628999', expect.stringContaining('Kirim?'));
    expect(result.action).toBe('kasbon_reminder_drafted');
  });

  it('sends an approved reminder and records owner approval on each kasbon', async () => {
    const customer = createCustomer();
    const kasbon = {
      _id: 'kasbon-1',
      remindersSent: [],
      save: vi.fn().mockResolvedValue(undefined),
    };
    customerFindOneMock.mockResolvedValue(customer);
    kasbonFindMock.mockResolvedValue([kasbon]);
    const session = createSession({
      state: 'awaiting_kasbon_reminder_approval',
      context: {
        reminderCustomerId: 'customer-1',
        reminderKasbonIds: ['kasbon-1'],
        reminderMessage: 'Halo Budi, total kasbon Rp70.000.',
      },
    });

    const result = await approveKasbonReminder({
      shop: createShop(),
      session,
      message: { from: '+628999', text: 'KIRIM' },
    });

    expect(sendTextMock).toHaveBeenCalledWith('+628111', 'Halo Budi, total kasbon Rp70.000.');
    expect(kasbon.remindersSent).toEqual([
      {
        sentAt: new Date('2026-06-01T03:00:00.000Z'),
        channel: 'whatsapp',
        approvedByOwner: true,
      },
    ]);
    expect(kasbon.save).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      '+628999',
      'Pengingat kasbon untuk Budi sudah dikirim.',
    );
    expect(result.action).toBe('kasbon_reminder_sent');
  });

  it('records payment, settles fully paid kasbon, and recomputes customer credit score', async () => {
    const kasbon = {
      _id: 'kasbon-1',
      shopId: 'shop-1',
      customerId: 'customer-1',
      status: 'open',
      amount: 40000,
      payments: [],
      save: vi.fn().mockResolvedValue(undefined),
    };
    const customer = createCustomer();
    kasbonFindOneMock.mockResolvedValue(kasbon);
    customerFindOneMock.mockResolvedValue(customer);
    kasbonFindMock.mockResolvedValue([{ ...kasbon, status: 'settled', amount: 0 }]);

    const result = await recordKasbonPayment({
      shopId: 'shop-1',
      kasbonId: 'kasbon-1',
      amount: 40000,
      note: 'tunai',
    });

    expect(kasbon.amount).toBe(0);
    expect(kasbon.status).toBe('settled');
    expect(kasbon.payments).toEqual([
      { amount: 40000, paidAt: new Date('2026-06-01T03:00:00.000Z'), note: 'tunai' },
    ]);
    expect(kasbon.save).toHaveBeenCalledTimes(1);
    expect(customer.creditScore).toMatchObject({ value: 0, band: 'good' });
    expect(result.score.band).toBe('good');
  });
});
