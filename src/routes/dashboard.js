import { Router } from 'express';
import express from 'express';
import { fileURLToPath } from 'node:url';

import {
  renderDashboard,
  renderDashboardB2b,
  renderDashboardChat,
  renderDashboardCustomers,
  renderDashboardProducts,
  renderLanding,
} from '../controllers/dashboardController.js';

export const dashboardRouter = Router();
const dashboardAssetsPath = fileURLToPath(new URL('../../web/dashboard', import.meta.url));

dashboardRouter.get('/', renderLanding);
dashboardRouter.get('/dashboard', renderDashboard);
dashboardRouter.get('/dashboard/chat', renderDashboardChat);
dashboardRouter.get('/dashboard/b2b', renderDashboardB2b);
dashboardRouter.get('/dashboard/products', renderDashboardProducts);
dashboardRouter.get('/dashboard/customers', renderDashboardCustomers);
dashboardRouter.use('/dashboard', express.static(dashboardAssetsPath, { index: false }));
