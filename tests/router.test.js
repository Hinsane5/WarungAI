import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findOrCreateByOwnerPhoneMock = vi.hoisted(() => vi.fn());
const getOrCreateSessionMock = vi.hoisted(() => vi.fn());
const handleTextPosMock = vi.hoisted(() => vi.fn());
const confirmPendingTransactionMock = vi.hoisted(() => vi.fn());
const cancelPendingFlowMock = vi.hoisted(() => vi.fn());
const describePendingActionMock = vi.hoisted(() => vi.fn());
const handleMissingPriceReplyMock = vi.hoisted(() => vi.fn());
const handlePendingPriceUpdateReplyMock = vi.hoisted(() => vi.fn());
const handlePriceUpdateCommandMock = vi.hoisted(() => vi.fn());
const parsePriceUpdateCommandMock = vi.hoisted(() => vi.fn());
const handleKasbonMock = vi.hoisted(() => vi.fn());
const draftKasbonReminderMock = vi.hoisted(() => vi.fn());
const approveKasbonReminderMock = vi.hoisted(() => vi.fn());
const parseReminderCommandMock = vi.hoisted(() => vi.fn());
const downloadMediaMock = vi.hoisted(() => vi.fn());
const transcribeOggOpusMock = vi.hoisted(() => vi.fn());
const sendTextMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/shopService.js', () => ({
  findOrCreateByOwnerPhone: findOrCreateByOwnerPhoneMock,
}));

vi.mock('../src/services/sessionService.js', () => ({
  getOrCreateSession: getOrCreateSessionMock,
  describePendingAction: describePendingActionMock,
}));

vi.mock('../src/services/posService.js', () => ({
  handleTextPos: handleTextPosMock,
  handleMissingPriceReply: handleMissingPriceReplyMock,
  confirmPendingTransaction: confirmPendingTransactionMock,
  cancelPendingFlow: cancelPendingFlowMock,
}));

vi.mock('../src/services/priceCommandService.js', () => ({
  handlePendingPriceUpdateReply: handlePendingPriceUpdateReplyMock,
  handlePriceUpdateCommand: handlePriceUpdateCommandMock,
  parsePriceUpdateCommand: parsePriceUpdateCommandMock,
}));

vi.mock('../src/services/kasbonService.js', () => ({
  handleKasbon: handleKasbonMock,
  draftKasbonReminder: draftKasbonReminderMock,
  approveKasbonReminder: approveKasbonReminderMock,
  parseReminderCommand: parseReminderCommandMock,
}));

vi.mock('../src/messaging/media.js', () => ({
  downloadMedia: downloadMediaMock,
}));

vi.mock('../src/ai/sttClient.js', () => ({
  transcribeOggOpus: transcribeOggOpusMock,
}));

vi.mock('../src/messaging/whatsapp.js', () => ({
  sendText: sendTextMock,
}));

const parseDaftarCommandMock = vi.hoisted(() => vi.fn());
const registerLoyaltyByDaftarMock = vi.hoisted(() => vi.fn());
const buildWaRegistrationLinkMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/loyaltyService.js', () => ({
  parseDaftarCommand: parseDaftarCommandMock,
  registerLoyaltyByDaftar: registerLoyaltyByDaftarMock,
  buildWaRegistrationLink: buildWaRegistrationLinkMock,
}));

const { routeInboundMessage } = await import('../src/intents/router.js');

describe('routeInboundMessage', () => {
  beforeEach(() => {
    findOrCreateByOwnerPhoneMock.mockResolvedValue({
      shop: { _id: 'shop-1' },
      created: false,
    });
    getOrCreateSessionMock.mockResolvedValue({ _id: 'session-1', state: 'idle' });
    handleTextPosMock.mockResolvedValue({ action: 'pending_confirmation' });
    handleMissingPriceReplyMock.mockResolvedValue({ action: 'pending_confirmation' });
    handlePendingPriceUpdateReplyMock.mockResolvedValue({ action: 'price_updated' });
    handlePriceUpdateCommandMock.mockResolvedValue({ action: 'clarifying_price_update' });
    parsePriceUpdateCommandMock.mockReturnValue(null);
    confirmPendingTransactionMock.mockResolvedValue({ action: 'committed' });
    handleKasbonMock.mockResolvedValue({ action: 'kasbon_recorded' });
    draftKasbonReminderMock.mockResolvedValue({ action: 'kasbon_reminder_drafted' });
    approveKasbonReminderMock.mockResolvedValue({ action: 'kasbon_reminder_sent' });
    parseReminderCommandMock.mockReturnValue(null);
    downloadMediaMock.mockResolvedValue(Buffer.from('ogg-opus'));
    transcribeOggOpusMock.mockResolvedValue({
      transcript: 'laku 2 indomie 3000',
      confidence: 0.82,
    });
    sendTextMock.mockResolvedValue({ messages: [{ id: 'sent-1' }] });
    describePendingActionMock.mockReturnValue('ubah harga');
    parseDaftarCommandMock.mockReturnValue(null);
    buildWaRegistrationLinkMock.mockReturnValue('https://wa.me/6281200000000?text=DAFTAR%20s');
    // simulate cancelPendingFlow resetting the session to idle
    cancelPendingFlowMock.mockImplementation(async ({ session }) => {
      session.state = 'idle';
      session.context = {};
    });
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

  it('routes existing idle text senders to the POS handler', async () => {
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'cek',
    };

    await routeInboundMessage(message);

    expect(handleTextPosMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session: { _id: 'session-1', state: 'idle' },
      message,
    });
  });

  it('answers /bantuan without routing to POS', async () => {
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: '/bantuan',
    };

    const result = await routeInboundMessage(message);

    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('Daftar Perintah WarungAI'),
    );
    expect(handleTextPosMock).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true, action: 'help' });
  });

  it('registers a customer from a DAFTAR message and never onboards a shop', async () => {
    parseDaftarCommandMock.mockReturnValue({ code: 'warung-slug' });
    registerLoyaltyByDaftarMock.mockResolvedValue({ ok: true, customer: { _id: 'cust-1' } });

    const result = await routeInboundMessage({
      from: '+6281100000000',
      profileName: 'Andi',
      type: 'text',
      text: 'DAFTAR warung-slug',
    });

    expect(registerLoyaltyByDaftarMock).toHaveBeenCalledWith({
      from: '+6281100000000',
      profileName: 'Andi',
      code: 'warung-slug',
    });
    expect(findOrCreateByOwnerPhoneMock).not.toHaveBeenCalled();
    expect(handleTextPosMock).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true, action: 'loyalty_registered', customerId: 'cust-1' });
  });

  it('tells the sender when a DAFTAR code is unknown (still no shop onboarding)', async () => {
    parseDaftarCommandMock.mockReturnValue({ code: 'nope' });
    registerLoyaltyByDaftarMock.mockResolvedValue({ ok: false, reason: 'shop_not_found' });

    const result = await routeInboundMessage({
      from: '+6281100000000',
      type: 'text',
      text: 'DAFTAR nope',
    });

    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281100000000',
      expect.stringContaining('kode warung tidak ditemukan'),
    );
    expect(findOrCreateByOwnerPhoneMock).not.toHaveBeenCalled();
    expect(result.action).toBe('loyalty_register_failed');
  });

  it('replies with the registration link on a "qr loyalty" command', async () => {
    const result = await routeInboundMessage({
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'qr loyalty',
    });

    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('https://wa.me/6281200000000'),
    );
    expect(handleTextPosMock).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true, action: 'loyalty_link' });
  });

  it('routes awaiting-confirmation text replies to the confirmation handler', async () => {
    const session = { _id: 'session-1', state: 'awaiting_confirmation' };
    getOrCreateSessionMock.mockResolvedValue(session);
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'Y',
    };

    await routeInboundMessage(message);

    expect(confirmPendingTransactionMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session,
      message,
    });
  });

  it('routes pending price replies before normal POS handling', async () => {
    const session = {
      _id: 'session-1',
      state: 'clarifying',
      context: { pendingPriceItem: { rawName: 'milo 500 gram' } },
    };
    getOrCreateSessionMock.mockResolvedValue(session);
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'modal 120000 jual 150000',
    };

    await routeInboundMessage(message);

    expect(handleMissingPriceReplyMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session,
      message,
    });
    expect(handleTextPosMock).not.toHaveBeenCalled();
  });

  it('cancels a pending flow when the owner types "batal"', async () => {
    const session = {
      _id: 'session-1',
      state: 'clarifying',
      context: { pendingPriceUpdate: { productId: 'p1' } },
    };
    getOrCreateSessionMock.mockResolvedValue(session);

    const result = await routeInboundMessage({
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'batal',
    });

    expect(cancelPendingFlowMock).toHaveBeenCalledWith({ session });
    expect(handlePendingPriceUpdateReplyMock).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('dibatalkan'),
    );
    expect(result).toEqual({ handled: true, action: 'pending_cancelled' });
  });

  it('lets a new command interrupt a pending flow', async () => {
    const session = {
      _id: 'session-1',
      state: 'clarifying',
      context: { pendingPriceUpdate: { productId: 'p1' } },
    };
    getOrCreateSessionMock.mockResolvedValue(session);
    parsePriceUpdateCommandMock.mockReturnValue({
      priceType: 'sellPrice',
      rawName: 'aqua',
      price: null,
    });
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'ubah harga jual aqua',
    };

    await routeInboundMessage(message);

    expect(cancelPendingFlowMock).toHaveBeenCalledWith({ session });
    expect(handlePendingPriceUpdateReplyMock).not.toHaveBeenCalled();
    expect(handlePriceUpdateCommandMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session,
      message,
    });
  });

  it('routes pending catalog price update replies before normal POS handling', async () => {
    const session = {
      _id: 'session-1',
      state: 'clarifying',
      context: { pendingPriceUpdate: { productId: 'product-1', priceType: 'sellPrice' } },
    };
    getOrCreateSessionMock.mockResolvedValue(session);
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: '15000',
    };

    await routeInboundMessage(message);

    expect(handlePendingPriceUpdateReplyMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session,
      message,
    });
    expect(handleTextPosMock).not.toHaveBeenCalled();
  });

  it('routes catalog price commands before POS parsing', async () => {
    parsePriceUpdateCommandMock.mockReturnValue({
      priceType: 'sellPrice',
      rawName: 'beras 15kg',
      price: null,
    });
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'ubah harga jual beras 15kg',
    };

    await routeInboundMessage(message);

    expect(handlePriceUpdateCommandMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session: { _id: 'session-1', state: 'idle' },
      message,
    });
    expect(handleTextPosMock).not.toHaveBeenCalled();
  });

  it('routes kasbon commands to the kasbon handler', async () => {
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'kasbon budi 2 rokok',
    };

    await routeInboundMessage(message);

    expect(handleKasbonMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session: { _id: 'session-1', state: 'idle' },
      message,
    });
    expect(handleTextPosMock).not.toHaveBeenCalled();
  });

  it('routes reminder approval replies before normal text handling', async () => {
    const session = { _id: 'session-1', state: 'awaiting_kasbon_reminder_approval' };
    getOrCreateSessionMock.mockResolvedValue(session);
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'KIRIM',
    };

    await routeInboundMessage(message);

    expect(approveKasbonReminderMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session,
      message,
    });
    expect(handleTextPosMock).not.toHaveBeenCalled();
  });

  it('routes reminder draft commands to kasbon reminder drafting', async () => {
    parseReminderCommandMock.mockReturnValue('budi');
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      type: 'text',
      text: 'tagih budi',
    };

    await routeInboundMessage(message);

    expect(draftKasbonReminderMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session: { _id: 'session-1', state: 'idle' },
      message,
    });
    expect(handleTextPosMock).not.toHaveBeenCalled();
  });

  it('transcribes audio messages and routes the transcript through POS', async () => {
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      messageId: 'wamid-audio',
      type: 'audio',
      audioMediaId: 'media-1',
      text: '',
    };

    await routeInboundMessage(message);

    expect(downloadMediaMock).toHaveBeenCalledWith('media-1');
    expect(transcribeOggOpusMock).toHaveBeenCalledWith(Buffer.from('ogg-opus'), {
      encoding: undefined,
    });
    expect(handleTextPosMock).toHaveBeenCalledWith({
      shop: { _id: 'shop-1' },
      session: { _id: 'session-1', state: 'idle' },
      message: {
        ...message,
        text: 'laku 2 indomie 3000',
        sttConfidence: 0.82,
      },
    });
  });

  it('asks the sender to retry when audio processing fails', async () => {
    downloadMediaMock.mockRejectedValue(new Error('media download failed'));

    const result = await routeInboundMessage({
      from: '+6281234567890',
      profileName: 'Bu Sri',
      messageId: 'wamid-audio',
      type: 'audio',
      audioMediaId: 'media-1',
      text: '',
    });

    expect(handleTextPosMock).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('kirim ulang'),
    );
    expect(result).toEqual({ handled: true, action: 'audio_transcription_failed' });
  });

  it('passes browser audio encoding through to STT', async () => {
    const message = {
      from: '+6281234567890',
      profileName: 'Bu Sri',
      messageId: 'chat-audio',
      type: 'audio',
      audioBuffer: Buffer.from('webm-opus'),
      audioEncoding: 'WEBM_OPUS',
      text: '',
    };

    await routeInboundMessage(message);

    expect(downloadMediaMock).not.toHaveBeenCalled();
    expect(transcribeOggOpusMock).toHaveBeenCalledWith(Buffer.from('webm-opus'), {
      encoding: 'WEBM_OPUS',
    });
  });
});
