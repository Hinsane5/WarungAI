import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from '../config/index.js';

export function isValidWhatsAppSignature(rawBody, signatureHeader) {
  if (!rawBody || !signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const expectedHex = createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest('hex');
  const receivedHex = signatureHeader.slice('sha256='.length);

  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

export function verifyWhatsAppSignature(req, res, next) {
  const signature = req.get('x-hub-signature-256');

  if (!isValidWhatsAppSignature(req.rawBody, signature)) {
    req.log?.warn('Invalid WhatsApp webhook signature');
    return res.sendStatus(403);
  }

  return next();
}
