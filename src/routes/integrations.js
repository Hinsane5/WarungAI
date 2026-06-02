import { Router } from 'express';

import { receiveN8nInbound } from '../controllers/integrationController.js';

export const integrationRouter = Router();

// Inbound from n8n (which fronts the WhatsApp gateway). See DOCS/N8N_INTEGRATION.md.
integrationRouter.post('/integrations/whatsapp/inbound', receiveN8nInbound);
