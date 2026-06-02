import { Router } from 'express';

import {
  dashboardCategoryMix,
  dashboardCreditScores,
  dashboardExport,
  dashboardPredictiveRestock,
  dashboardSalesTrend,
  dashboardSummary,
  dashboardTopItems,
} from '../controllers/dashboardController.js';

export const apiRouter = Router();

apiRouter.get('/api/dashboard/summary', dashboardSummary);
apiRouter.get('/api/dashboard/sales-trend', dashboardSalesTrend);
apiRouter.get('/api/dashboard/category-mix', dashboardCategoryMix);
apiRouter.get('/api/dashboard/top-items', dashboardTopItems);
apiRouter.get('/api/dashboard/predictive-restock', dashboardPredictiveRestock);
apiRouter.get('/api/dashboard/credit-scores', dashboardCreditScores);
apiRouter.get('/api/dashboard/export', dashboardExport);
