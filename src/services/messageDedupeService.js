const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5000;

export class MessageDedupeStore {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
  }

  has(messageId) {
    this.pruneExpired();
    return this.entries.has(messageId);
  }

  mark(messageId) {
    this.pruneExpired();

    if (this.entries.has(messageId)) {
      this.entries.delete(messageId);
    }

    this.entries.set(messageId, this.now() + this.ttlMs);
    this.pruneOverflow();
  }

  clear() {
    this.entries.clear();
  }

  pruneExpired() {
    const now = this.now();

    for (const [messageId, expiresAt] of this.entries) {
      if (expiresAt > now) {
        continue;
      }

      this.entries.delete(messageId);
    }
  }

  pruneOverflow() {
    while (this.entries.size > this.maxEntries) {
      const oldestMessageId = this.entries.keys().next().value;
      this.entries.delete(oldestMessageId);
    }
  }
}

const processedMessages = new MessageDedupeStore();

export function hasProcessedMessage(messageId) {
  return processedMessages.has(messageId);
}

export function markMessageProcessed(messageId) {
  processedMessages.mark(messageId);
}

export function resetMessageDedupeStore() {
  processedMessages.clear();
}
