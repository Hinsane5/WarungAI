import { config } from '../config/index.js';
import { Shop } from '../models/Shop.js';
import { exportTransactions } from '../services/bigqueryService.js';
import { logger } from '../utils/logger.js';
import { runCreditScoreRefresh } from './creditScoreRefresh.js';
import { runCrmNotifier } from './crmNotifier.js';
import { runPredictiveRestock } from './predictiveRestock.js';

// Global fallback time for shops that haven't set their own (derived from CRM_NIGHTLY_CRON
// "m h * * *"). Bu Sri can override it per-shop via WhatsApp.
function defaultScheduleMinutes() {
  const [minute, hour] = String(config.jobs.nightlyCron).split(/\s+/);
  const h = Number(hour);
  const m = Number(minute);
  return (Number.isFinite(h) ? h : 1) * 60 + (Number.isFinite(m) ? m : 0);
}

// Current wall-clock date + minute-of-day in the configured timezone, without a tz library.
export function localParts(now, timeZone = config.jobs.timezone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function scheduleMinutes(shop) {
  const schedule = shop.evaluationSchedule;
  if (schedule && schedule.hour != null) {
    return schedule.hour * 60 + (schedule.minute ?? 0);
  }
  return defaultScheduleMinutes();
}

// A shop is due when "now" (its timezone) has reached its scheduled minute-of-day and it
// has not already been evaluated today.
export function selectDueShops(shops, now) {
  const due = [];
  for (const shop of shops) {
    const { date, minutes } = localParts(now, shop.settings?.timezone ?? config.jobs.timezone);
    if (minutes >= scheduleMinutes(shop) && shop.lastEvaluationDate !== date) {
      due.push({ shop, date });
    }
  }
  return due;
}

// Run the per-shop evaluation (restock + credit + CRM) for every shop whose time has come.
export async function runDueEvaluations({ now = new Date() } = {}) {
  const shops = await Shop.find({});
  const due = selectDueShops(shops, now);

  if (due.length === 0) {
    return { evaluated: 0 };
  }

  const shopIds = due.map((entry) => entry.shop._id);
  const shopFilter = { _id: { $in: shopIds } };

  const restock = await runPredictiveRestock({ now, shopFilter });
  const credit = await runCreditScoreRefresh({ now, shopIds });
  const crm = await runCrmNotifier({ now, shopFilter });

  // Mark each shop evaluated for its own local date (so it runs exactly once per day).
  await Promise.all(
    due.map((entry) =>
      Shop.updateOne({ _id: entry.shop._id }, { $set: { lastEvaluationDate: entry.date } }),
    ),
  );

  logger.info({ evaluated: due.length }, 'due evaluations complete');
  return { evaluated: due.length, restock, credit, crm };
}

// One scheduler tick (called every minute in production): run any due per-shop
// evaluations, plus the global BigQuery export once per day at 02:00 local time.
export async function runScheduledTick({ now = new Date() } = {}) {
  const due = await runDueEvaluations({ now });

  let bigquery = { skipped: true };
  const { minutes } = localParts(now);
  if (config.bigquery.enabled && minutes === 2 * 60) {
    try {
      bigquery = await exportTransactions({ fullReload: true });
    } catch (error) {
      logger.error({ err: error }, 'BigQuery export failed');
      bigquery = { error: error.message };
    }
  }

  return { due, bigquery };
}
