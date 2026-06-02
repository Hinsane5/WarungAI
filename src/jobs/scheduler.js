import cron from 'node-cron';

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runNightlyJobs } from './index.js';

// Registers the nightly batch via node-cron (the MVP scheduler). In production this can be
// replaced by Cloud Scheduler hitting an HTTP endpoint that calls runNightlyJobs() — the
// jobs themselves stay unchanged. Returns the task, or null when disabled.
export function registerCronJobs() {
  if (!config.jobs.enabled) {
    logger.info('CRM cron jobs disabled (CRM_JOBS_ENABLED=false)');
    return null;
  }

  const task = cron.schedule(
    config.jobs.nightlyCron,
    () => {
      runNightlyJobs().catch((error) => logger.error({ err: error }, 'nightly jobs failed'));
    },
    { timezone: config.jobs.timezone },
  );

  logger.info(
    { cron: config.jobs.nightlyCron, timezone: config.jobs.timezone },
    'CRM cron jobs registered',
  );
  return task;
}
