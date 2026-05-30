import { describe, expect, it } from 'vitest';

import { MessageDedupeStore } from '../src/services/messageDedupeService.js';

describe('MessageDedupeStore', () => {
  it('expires processed message ids after the configured TTL', () => {
    let now = 1000;
    const store = new MessageDedupeStore({ ttlMs: 100, now: () => now });

    store.mark('wamid-1');

    expect(store.has('wamid-1')).toBe(true);

    now = 1100;

    expect(store.has('wamid-1')).toBe(false);
  });

  it('evicts the oldest message ids when the cache is full', () => {
    const store = new MessageDedupeStore({ ttlMs: 1000, maxEntries: 2, now: () => 1000 });

    store.mark('wamid-1');
    store.mark('wamid-2');
    store.mark('wamid-3');

    expect(store.has('wamid-1')).toBe(false);
    expect(store.has('wamid-2')).toBe(true);
    expect(store.has('wamid-3')).toBe(true);
  });
});
