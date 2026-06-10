import { randomUUID } from 'node:crypto';

import { routeInboundMessage } from '../intents/router.js';
import { runCaptured } from '../messaging/capture.js';
import { getShopByDashboardToken } from '../services/analyticsService.js';

function audioEncodingFromMimeType(mimeType = '') {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes('webm')) {
    return 'WEBM_OPUS';
  }

  return 'OGG_OPUS';
}

function resolveText(body) {
  const text = String(body?.text ?? '').trim();
  return text || null;
}

function resolveAudio(body) {
  const audioBase64 = String(body?.audioBase64 ?? '').trim();
  if (!audioBase64) {
    return null;
  }

  return Buffer.from(audioBase64, 'base64');
}

export async function sendChatMessage(req, res) {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({ ok: false, error: 'dashboard_token_required' });
    }

    const shop = await getShopByDashboardToken(token);
    if (!shop) {
      return res.status(404).json({ ok: false, error: 'shop_not_found' });
    }

    const text = resolveText(req.body);
    const audioBuffer = resolveAudio(req.body);

    if (!text && !audioBuffer) {
      return res.status(400).json({ ok: false, error: 'message_required' });
    }

    const message = {
      from: shop.ownerPhone,
      profileName: shop.ownerName,
      messageId: `chat-${randomUUID()}`,
      type: text ? 'text' : 'audio',
      text: text ?? '',
      audioBuffer,
      audioEncoding: audioBuffer ? audioEncodingFromMimeType(req.body?.mimeType) : undefined,
      audioMimeType: audioBuffer ? req.body?.mimeType : undefined,
      timestamp: new Date(),
    };

    const sink = await runCaptured(() => routeInboundMessage(message));

    // Split captured sends by recipient: messages back to the owner power the owner phone;
    // anything addressed elsewhere (kasbon detail, reminders, stamp) is a customer-facing
    // message and drives the side-by-side "customer phone" view.
    const ownerDigits = String(shop.ownerPhone ?? '').replace(/\D/gu, '');
    const replies = [];
    const customerMessages = [];
    for (const item of sink) {
      if (String(item.to ?? '').replace(/\D/gu, '') === ownerDigits) {
        replies.push(item.body);
      } else {
        customerMessages.push({ to: item.to, body: item.body });
      }
    }

    return res.status(200).json({ ok: true, replies, customerMessages });
  } catch (error) {
    req.log?.error({ err: error }, 'Chat send failed');
    return res.status(500).json({ ok: false, error: 'chat_failed' });
  }
}
