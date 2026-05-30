const processedMessageIds = new Set();

export function hasProcessedMessage(messageId) {
  return processedMessageIds.has(messageId);
}

export function markMessageProcessed(messageId) {
  processedMessageIds.add(messageId);
}

export function clearProcessedMessagesForTest() {
  processedMessageIds.clear();
}
