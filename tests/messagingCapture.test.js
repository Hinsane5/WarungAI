import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runCaptured } = await import('../src/messaging/capture.js');
const { sendText } = await import('../src/messaging/whatsapp.js');

function jsonResponse(payload = { messages: [{ id: 'sent-1' }] }) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  };
}

describe('messaging capture', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('captures sendText replies inside runCaptured without calling WhatsApp', async () => {
    const replies = await runCaptured(async () => {
      await sendText('+628123', 'Pesan pertama');
      await Promise.resolve();
      await sendText('+628123', 'Pesan kedua');
    });

    expect(replies).toEqual([
      { to: '+628123', body: 'Pesan pertama' },
      { to: '+628123', body: 'Pesan kedua' },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the normal WhatsApp transport outside capture scope', async () => {
    await expect(sendText('+628123', 'Halo')).resolves.toEqual({ messages: [{ id: 'sent-1' }] });

    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/test-phone-number-id/messages',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"body":"Halo"'),
      }),
    );
  });
});
