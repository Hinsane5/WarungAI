import express from 'express';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';

import { logger } from './utils/logger.js';

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

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}

export const app = createApp();
