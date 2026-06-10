import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getShopByDashboardTokenMock = vi.hoisted(() => vi.fn());
const getDashboardSummaryMock = vi.hoisted(() => vi.fn());
const getSalesTrendMock = vi.hoisted(() => vi.fn());
const getCategoryMixMock = vi.hoisted(() => vi.fn());
const getTopItemsMock = vi.hoisted(() => vi.fn());
const getPredictiveRestockMock = vi.hoisted(() => vi.fn());
const getCreditScoresMock = vi.hoisted(() => vi.fn());
const buildMonthlyExcelExportMock = vi.hoisted(() => vi.fn());
const routeInboundMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/analyticsService.js', () => ({
  getShopByDashboardToken: getShopByDashboardTokenMock,
  getDashboardSummary: getDashboardSummaryMock,
  getSalesTrend: getSalesTrendMock,
  getCategoryMix: getCategoryMixMock,
  getTopItems: getTopItemsMock,
  getPredictiveRestock: getPredictiveRestockMock,
  getCreditScores: getCreditScoresMock,
  buildMonthlyExcelExport: buildMonthlyExcelExportMock,
}));

vi.mock('../src/intents/router.js', () => ({
  routeInboundMessage: routeInboundMessageMock,
}));

const { sendText } = await import('../src/messaging/whatsapp.js');
const { app } = await import('../src/app.js');

const shop = {
  _id: 'shop-1',
  ownerPhone: '+6281234567890',
  ownerName: 'Bu Sri',
};

describe('chat routes', () => {
  beforeEach(() => {
    getShopByDashboardTokenMock.mockResolvedValue(shop);
    routeInboundMessageMock.mockImplementation(async (message) => {
      await sendText(message.from, 'Balas Y untuk simpan.');
      return { handled: true };
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requires a dashboard token', async () => {
    await request(app).post('/api/chat/send').send({ text: 'masuk 2 indomie' }).expect(401, {
      ok: false,
      error: 'dashboard_token_required',
    });
  });

  it('returns 404 for an unknown dashboard token', async () => {
    getShopByDashboardTokenMock.mockResolvedValueOnce(null);

    await request(app)
      .post('/api/chat/send')
      .query({ token: 'dash-missing' })
      .send({ text: 'masuk 2 indomie' })
      .expect(404, { ok: false, error: 'shop_not_found' });
  });

  it('runs text messages as the token shop owner and returns captured replies', async () => {
    await request(app)
      .post('/api/chat/send')
      .query({ token: 'dash-test' })
      .send({ text: ' masuk 2 indomie ' })
      .expect(200, { ok: true, replies: ['Balas Y untuk simpan.'], customerMessages: [] });

    expect(getShopByDashboardTokenMock).toHaveBeenCalledWith('dash-test');
    expect(routeInboundMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '+6281234567890',
        profileName: 'Bu Sri',
        messageId: expect.stringMatching(/^chat-/u),
        type: 'text',
        text: 'masuk 2 indomie',
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('splits messages addressed to a customer into customerMessages', async () => {
    routeInboundMessageMock.mockImplementation(async (message) => {
      await sendText(message.from, 'Tercatat. Benar? Balas Y / T'); // to the owner
      await sendText('+628999000111', 'Info kasbon dari Warung Bu Sri: Rp50.000.'); // to a customer
      return { handled: true };
    });

    await request(app)
      .post('/api/chat/send')
      .query({ token: 'dash-test' })
      .send({ text: 'kasbon budi 2 rokok 50000' })
      .expect(200, {
        ok: true,
        replies: ['Tercatat. Benar? Balas Y / T'],
        customerMessages: [
          { to: '+628999000111', body: 'Info kasbon dari Warung Bu Sri: Rp50.000.' },
        ],
      });
  });

  it('runs browser WEBM voice notes through the audio path', async () => {
    const audio = Buffer.from('webm-opus');

    await request(app)
      .post('/api/chat/send')
      .query({ token: 'dash-test' })
      .send({
        audioBase64: audio.toString('base64'),
        mimeType: 'audio/webm;codecs=opus',
      })
      .expect(200, { ok: true, replies: ['Balas Y untuk simpan.'], customerMessages: [] });

    expect(routeInboundMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'audio',
        text: '',
        audioBuffer: audio,
        audioEncoding: 'WEBM_OPUS',
        audioMimeType: 'audio/webm;codecs=opus',
      }),
    );
  });

  it('rejects empty chat payloads', async () => {
    await request(app)
      .post('/api/chat/send')
      .query({ token: 'dash-test' })
      .send({})
      .expect(400, { ok: false, error: 'message_required' });
  });

  it('returns 500 (does not hang) when the pipeline throws', async () => {
    routeInboundMessageMock.mockRejectedValueOnce(new Error('pipeline boom'));

    await request(app)
      .post('/api/chat/send')
      .query({ token: 'dash-test' })
      .send({ text: 'masuk 2 indomie' })
      .expect(500, { ok: false, error: 'chat_failed' });
  });
});
