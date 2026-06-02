import express from 'express';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';

import { getDbStatus } from './config/db.js';
import { integrationRouter } from './routes/integrations.js';
import { loyaltyRouter } from './routes/loyalty.js';
import { webhookRouter } from './routes/webhook.js';
import { logger } from './utils/logger.js';

function captureRawBody(req, _res, buffer) {
  req.rawBody = buffer;
}

export function createApp() {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.headers['x-request-id'] ?? randomUUID(),
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) {
          return 'error';
        }

        if (res.statusCode >= 400) {
          return 'warn';
        }

        return 'info';
      },
    }),
  );

  app.use(express.json({ verify: captureRawBody }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', db: getDbStatus() });
  });

  app.use('/webhook', webhookRouter);
  app.use(loyaltyRouter);
  app.use(integrationRouter);

  return app;
}

export const app = createApp();
