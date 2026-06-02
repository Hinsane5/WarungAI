import { Router } from 'express';

import { triggerNightlyJobs } from '../controllers/jobsController.js';

export const jobsRouter = Router();

// Cloud Scheduler / external cron target. Secured by X-WarungAI-Jobs-Secret.
jobsRouter.post('/jobs/run-nightly', triggerNightlyJobs);
