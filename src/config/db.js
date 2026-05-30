import mongoose from 'mongoose';

import { config } from './index.js';
import { logger } from '../utils/logger.js';

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectDb({
  uri = config.mongo.uri,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
} = {}) {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt += 1;

    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      logger.info({ attempt }, 'MongoDB connected');
      return mongoose.connection;
    } catch (error) {
      logger.error({ err: error, attempt, maxRetries }, 'MongoDB connection failed');

      if (attempt >= maxRetries) {
        throw error;
      }

      await sleep(retryDelayMs);
    }
  }

  throw new Error('MongoDB connection failed');
}

export async function disconnectDb() {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export function registerDbShutdownHandlers() {
  const shutdown = async (signal) => {
    try {
      logger.info({ signal }, 'Shutting down database connection');
      await disconnectDb();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error, signal }, 'Database shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
