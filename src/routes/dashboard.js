import { Router } from 'express';
import express from 'express';
import { fileURLToPath } from 'node:url';

import { renderDashboard } from '../controllers/dashboardController.js';

export const dashboardRouter = Router();
const dashboardAssetsPath = fileURLToPath(new URL('../../web/dashboard', import.meta.url));

dashboardRouter.get('/dashboard', renderDashboard);
dashboardRouter.use('/dashboard', express.static(dashboardAssetsPath, { index: false }));
