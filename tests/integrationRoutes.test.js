import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeInboundMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../src/intents/router.js', () => ({
  routeInboundMessage: routeInboundMessageMock,
}));

import { app } from '../src/app.js';
import { resetMessageDedupeStore } from '../src/services/messageDedupeService.js';

const SECRET = process.env.N8N_INBOUND_SECRET;

const samplePayload = {
  from: '6285363093316',
  messageId: 'evo-1',
  type: 'text',
  text: 'masuk 2 dus indomie',
  profileName: 'Bu Sri',
  timestamp: 1780000000,
};

async function waitFor(assertion) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < 500) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  throw lastError;
}

describe('POST /integrations/whatsapp/inbound', () => {
  beforeEach(() => {
    resetMessageDedupeStore();
    routeInboundMessageMock.mockResolvedValue({ handled: true });
  });
  afterEach(() => vi.clearAllMocks());

  it('rejects requests without the shared secret', async () => {
    await request(app).post('/integrations/whatsapp/inbound').send(samplePayload).expect(403);
    expect(routeInboundMessageMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    await request(app)
      .post('/integrations/whatsapp/inbound')
      .set('x-warungai-secret', 'nope')
      .send(samplePayload)
      .expect(403);
    expect(routeInboundMessageMock).not.toHaveBeenCalled();
  });

  it('acks 200 and routes a valid inbound message', async () => {
    await request(app)
      .post('/integrations/whatsapp/inbound')
      .set('x-warungai-secret', SECRET)
      .send(samplePayload)
      .expect(200);

    await waitFor(() => {
      expect(routeInboundMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '+6285363093316',
          messageId: 'evo-1',
          type: 'text',
          text: 'masuk 2 dus indomie',
        }),
      );
    });
  });

  it('dedupes repeated message ids', async () => {
    for (let i = 0; i < 2; i += 1) {
      await request(app)
        .post('/integrations/whatsapp/inbound')
        .set('x-warungai-secret', SECRET)
        .send(samplePayload)
        .expect(200);
    }
    await waitFor(() => expect(routeInboundMessageMock).toHaveBeenCalledTimes(1));
  });
});
