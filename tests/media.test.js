import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadMedia, resolveMediaUrl } = await import('../src/messaging/media.js');

function jsonResponse(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(options.text ?? ''),
  };
}

describe('messaging media', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves WhatsApp media URLs with Graph API auth', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ url: 'https://cdn.example.test/audio.ogg' }));

    await expect(resolveMediaUrl('media-1')).resolves.toBe('https://cdn.example.test/audio.ogg');

    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/media-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-whatsapp-token',
        }),
      }),
    );
  });

  it('downloads WhatsApp media bytes with auth on the resolved URL', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    fetch
      .mockResolvedValueOnce(jsonResponse({ url: 'https://cdn.example.test/audio.ogg' }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(bytes),
        text: vi.fn().mockResolvedValue(''),
      });

    const result = await downloadMedia('media-1');

    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenLastCalledWith(
      'https://cdn.example.test/audio.ogg',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-whatsapp-token',
        }),
      }),
    );
  });

  it('throws when media resolution fails', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401, text: 'unauthorized' }));

    await expect(resolveMediaUrl('media-1')).rejects.toThrow(
      'WhatsApp media resolve failed: 401 unauthorized',
    );
  });
});
