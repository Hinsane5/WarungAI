import pino from 'pino';

import { config } from '../config/index.js';

export const logger = pino({
  level: config.logLevel,
  base: {
    service: 'warungai',
    env: config.nodeEnv,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      '*.token',
      '*.password',
      '*.secret',
      'whatsapp.token',
      'whatsapp.appSecret',
    ],
    censor: '[REDACTED]',
  },
});

export function childLogger(bindings) {
  return logger.child(bindings);
}
