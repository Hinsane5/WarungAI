import { timingSafeEqual } from 'node:crypto';

import { config } from '../config/index.js';
import { routeInboundMessage } from '../intents/router.js';
import { hasProcessedMessage, markMessageProcessed } from '../services/messageDedupeService.js';
import { normalizePhone } from '../utils/phone.js';

function secretValid(provided) {
  const expected = config.n8n.inboundSecret;
  if (!expected || !provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

// Normalizes an n8n/gateway payload into the same internal shape used by the Meta webhook,
// so routeInboundMessage handles it identically (POS, kasbon, loyalty, voice).
function normalizeN8nMessage(body) {
  if (!body?.from || !body?.messageId) {
    return null;
  }

  return {
    from: normalizePhone(body.from),
    messageId: String(body.messageId),
    type: body.type ?? 'text',
    text: body.text ?? '',
    audioMediaId: null,
    audioBuffer: body.audioBase64 ? Buffer.from(body.audioBase64, 'base64') : null,
    profileName: body.profileName ?? null,
    timestamp: body.timestamp ? new Date(Number(body.timestamp) * 1000) : null,
  };
}

export function receiveN8nInbound(req, res) {
  if (!secretValid(req.get('x-warungai-secret'))) {
    res.sendStatus(403);
    return;
  }

  res.sendStatus(200);

  const message = normalizeN8nMessage(req.body);
  if (!message || !message.from || !message.messageId) {
    return;
  }

  setImmediate(() => {
    (async () => {
      if (hasProcessedMessage(message.messageId)) {
        return;
      }
      markMessageProcessed(message.messageId);
      await routeInboundMessage(message);
    })().catch((error) => {
      req.log?.error({ err: error }, 'n8n inbound processing failed');
    });
  });
}
