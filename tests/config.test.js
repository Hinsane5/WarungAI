import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('allows blank GOOGLE_APPLICATION_CREDENTIALS so Google auth can use ADC', async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '';

    const { config } = await import('../src/config/index.js');

    expect(config.gcp.credentialsPath).toBeNull();
  });
});
