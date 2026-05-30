import { config } from '../config/index.js';
import { normalizeInboundMessages } from '../messaging/normalize.js';
import { sendText } from '../messaging/whatsapp.js';
import { hasProcessedMessage, markMessageProcessed } from '../services/messageDedupeService.js';
import { logger } from '../utils/logger.js';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

export function receiveWebhook(req, res) {
  res.sendStatus(200);

  setImmediate(() => {
    processWebhookPayload(req.body, req.id).catch((error) => {
      req.log?.error({ err: error }, 'WhatsApp webhook async processing failed');
    });
  });
}

export async function processWebhookPayload(payload, correlationId) {
  const messages = normalizeInboundMessages(payload);
  const log = correlationId ? logger.child({ correlationId }) : logger;

  for (const message of messages) {
    if (hasProcessedMessage(message.messageId)) {
      log.info({ messageId: message.messageId }, 'Duplicate WhatsApp message ignored');
      continue;
    }

    markMessageProcessed(message.messageId);
    await handleEchoMessage(message);
  }
}

async function handleEchoMessage(message) {
  if (message.type !== 'text' || !message.text) {
    await sendText(message.from, 'Untuk saat ini, kirim pesan teks dulu ya.');
    return;
  }

  await sendText(message.from, `Anda menulis: ${message.text}`);
}
