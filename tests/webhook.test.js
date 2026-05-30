import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeInboundMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../src/intents/router.js', () => ({
  routeInboundMessage: routeInboundMessageMock,
}));

import { app } from '../src/app.js';
import { resetMessageDedupeStore } from '../src/services/messageDedupeService.js';

const textMessageFixture = JSON.parse(
  readFileSync(new URL('./fixtures/webhooks/textMessage.json', import.meta.url), 'utf8'),
);

function signPayload(rawBody) {
  const digest = createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  return `sha256=${digest}`;
}

function createFetchResponse({
  ok = true,
  status = 200,
  body = { messages: [{ id: 'sent-1' }] },
} = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

async function waitForExpectation(assertion) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 500) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

describe('/webhook', () => {
  beforeEach(() => {
    resetMessageDedupeStore();
    routeInboundMessageMock.mockResolvedValue({ handled: true, action: 'test' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes the Meta verification handshake with the configured token', async () => {
    await request(app)
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN,
        'hub.challenge': 'challenge-123',
      })
      .expect(200, 'challenge-123');
  });

  it('rejects the Meta verification handshake with a wrong token', async () => {
    await request(app)
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-123',
      })
      .expect(403);
  });

  it('rejects POST requests with an invalid signature', async () => {
    await request(app)
      .post('/webhook')
      .set('x-hub-signature-256', 'sha256=bad')
      .send(textMessageFixture)
      .expect(403);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('acknowledges a valid text message and routes it asynchronously', async () => {
    const rawBody = JSON.stringify(textMessageFixture);

    await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signPayload(rawBody))
      .send(rawBody)
      .expect(200);

    await waitForExpectation(() => {
      expect(routeInboundMessageMock).toHaveBeenCalledWith({
        from: '+6281234567890',
        messageId: 'wamid.test-1',
        type: 'text',
        text: 'halo warungai',
        audioMediaId: null,
        profileName: 'Bu Sri',
        timestamp: new Date(1780121282 * 1000),
      });
    });
  });

  it('ignores duplicate WhatsApp message ids', async () => {
    const rawBody = JSON.stringify(textMessageFixture);
    const signature = signPayload(rawBody);

    await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(rawBody)
      .expect(200);

    await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(rawBody)
      .expect(200);

    await waitForExpectation(() => {
      expect(routeInboundMessageMock).toHaveBeenCalledTimes(1);
    });
  });

  it('still returns 200 when async message handling fails', async () => {
    routeInboundMessageMock.mockRejectedValue(new Error('routing failed'));
    const rawBody = JSON.stringify(textMessageFixture);

    await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signPayload(rawBody))
      .send(rawBody)
      .expect(200);

    await waitForExpectation(() => {
      expect(routeInboundMessageMock).toHaveBeenCalledTimes(1);
    });
  });
});
