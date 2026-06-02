import { logger } from '../utils/logger.js';
import { runCreditScoreRefresh } from './creditScoreRefresh.js';
import { runCrmNotifier } from './crmNotifier.js';
import { runPredictiveRestock } from './predictiveRestock.js';

export { runPredictiveRestock, runCreditScoreRefresh, runCrmNotifier };

// Orchestrates the nightly batch. Each step is independently callable (cron or an
// HTTP/Cloud Scheduler trigger). Order: restock predictions → credit refresh → CRM sends.
export async function runNightlyJobs({ now = new Date() } = {}) {
  logger.info('nightly jobs started');
  const restock = await runPredictiveRestock({ now });
  const credit = await runCreditScoreRefresh({ now });
  const crm = await runCrmNotifier({ now });
  logger.info({ restock, credit, crm }, 'nightly jobs finished');
  return { restock, credit, crm };
}
