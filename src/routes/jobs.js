import { Router } from 'express';

import { triggerEvaluationTick, triggerNightlyJobs } from '../controllers/jobsController.js';

export const jobsRouter = Router();

// Cloud Scheduler / external cron targets. Secured by X-WarungAI-Jobs-Secret.
jobsRouter.post('/jobs/run-nightly', triggerNightlyJobs);
// Every-minute tick: runs per-shop evaluations at each shop's owner-set time.
jobsRouter.post('/jobs/tick', triggerEvaluationTick);
