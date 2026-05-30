import { Router } from 'express';

import { receiveWebhook, verifyWebhook } from '../controllers/webhookController.js';
import { verifyWhatsAppSignature } from '../middleware/verifySignature.js';

export const webhookRouter = Router();

webhookRouter.get('/', verifyWebhook);
webhookRouter.post('/', verifyWhatsAppSignature, receiveWebhook);
