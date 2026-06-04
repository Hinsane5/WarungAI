import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findOrCreateByOwnerPhoneMock = vi.hoisted(() => vi.fn());
const getOrCreateSessionMock = vi.hoisted(() => vi.fn());
const handleTextPosMock = vi.hoisted(() => vi.fn());
const confirmPendingTransactionMock = vi.hoisted(() => vi.fn());
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
}));

vi.mock('../src/services/posService.js', () => ({
  handleTextPos: handleTextPosMock,
  confirmPendingTransaction: confirmPendingTransactionMock,
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

const { routeInboundMessage } = await import('../src/intents/router.js');

describe('routeInboundMessage', () => {
  beforeEach(() => {
    findOrCreateByOwnerPhoneMock.mockResolvedValue({
      shop: { _id: 'shop-1' },
      created: false,
    });
    getOrCreateSessionMock.mockResolvedValue({ _id: 'session-1', state: 'idle' });
    handleTextPosMock.mockResolvedValue({ action: 'pending_confirmation' });
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
      expect.stringContaining('Daftar perintah WarungAI'),
    );
    expect(handleTextPosMock).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true, action: 'help' });
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
