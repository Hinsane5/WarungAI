import { normalizePhone } from '../utils/phone.js';

function extractText(message) {
  if (message.type === 'text') {
    return message.text?.body ?? '';
  }

  if (message.type === 'button') {
    return message.button?.text ?? message.button?.payload ?? '';
  }

  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ??
      message.interactive?.button_reply?.id ??
      message.interactive?.list_reply?.title ??
      message.interactive?.list_reply?.id ??
      ''
    );
  }

  return '';
}

export function normalizeInboundMessages(payload) {
  const normalized = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const contactsByWaId = new Map(
        (value.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name]),
      );

      for (const message of value.messages ?? []) {
        normalized.push({
          from: normalizePhone(message.from),
          messageId: message.id,
          type: message.type,
          text: extractText(message),
          audioMediaId: message.audio?.id ?? null,
          profileName: contactsByWaId.get(message.from) ?? null,
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : null,
        });
      }
    }
  }

  return normalized.filter((message) => message.from && message.messageId);
}
