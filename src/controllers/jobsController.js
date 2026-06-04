import { timingSafeEqual } from 'node:crypto';

import { config } from '../config/index.js';
import { runNightlyJobs, runScheduledTick } from '../jobs/index.js';

function secretValid(provided) {
  const expected = config.jobs.triggerSecret;
  // Fail closed: if no secret is configured, the trigger endpoint is disabled.
  if (!expected || !provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

// HTTP trigger for the nightly batch — called by Cloud Scheduler (or any cron) in deployed
// environments where node-cron is disabled. Runs synchronously and returns the summary so
// the scheduler can retry on failure. See DOCS/DEPLOYMENT.md.
export async function triggerNightlyJobs(req, res) {
  if (!secretValid(req.get('x-warungai-jobs-secret'))) {
    return res.sendStatus(403);
  }

  try {
    const result = await runNightlyJobs();
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    req.log?.error({ err: error }, 'Nightly jobs trigger failed');
    return res.status(500).json({ ok: false, error: 'jobs_failed' });
  }
}

// HTTP trigger meant to be called every minute by Cloud Scheduler. Runs the per-shop
// evaluation only for shops whose owner-set time has arrived (and once-a-day BigQuery).
export async function triggerEvaluationTick(req, res) {
  if (!secretValid(req.get('x-warungai-jobs-secret'))) {
    return res.sendStatus(403);
  }

  try {
    const result = await runScheduledTick();
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    req.log?.error({ err: error }, 'Evaluation tick failed');
    return res.status(500).json({ ok: false, error: 'jobs_failed' });
  }
}
