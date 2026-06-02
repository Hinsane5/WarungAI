import { config } from '../config/index.js';
import { exportTransactions } from '../services/bigqueryService.js';
import { logger } from '../utils/logger.js';
import { runCreditScoreRefresh } from './creditScoreRefresh.js';
import { runCrmNotifier } from './crmNotifier.js';
import { runPredictiveRestock } from './predictiveRestock.js';

export { runPredictiveRestock, runCreditScoreRefresh, runCrmNotifier };

// Orchestrates the nightly batch. Each step is independently callable (cron or an
// HTTP/Cloud Scheduler trigger). Order: restock predictions → credit refresh → CRM sends
// → (optional) BigQuery export of committed sales for regional analytics.
export async function runNightlyJobs({ now = new Date() } = {}) {
  logger.info('nightly jobs started');
  const restock = await runPredictiveRestock({ now });
  const credit = await runCreditScoreRefresh({ now });
  const crm = await runCrmNotifier({ now });

  let bigquery = { skipped: true };
  if (config.bigquery.enabled) {
    try {
      bigquery = await exportTransactions({ fullReload: true });
    } catch (error) {
      logger.error({ err: error }, 'BigQuery export failed');
      bigquery = { error: error.message };
    }
  }

  logger.info({ restock, credit, crm, bigquery }, 'nightly jobs finished');
  return { restock, credit, crm, bigquery };
}
