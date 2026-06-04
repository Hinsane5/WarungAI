import { Router } from 'express';

import { sendChatMessage } from '../controllers/chatController.js';
import {
  dashboardB2bPriceTrend,
  dashboardB2bSummary,
  dashboardB2bTopBrands,
  dashboardB2bTurnover,
  dashboardCategoryMix,
  dashboardCreateProduct,
  dashboardCrmPreview,
  dashboardCustomers,
  dashboardCreditScores,
  dashboardExport,
  dashboardPredictiveRestock,
  dashboardProducts,
  dashboardSalesTrend,
  dashboardSummary,
  dashboardTopItems,
} from '../controllers/dashboardController.js';

export const apiRouter = Router();

apiRouter.post('/api/chat/send', sendChatMessage);
apiRouter.get('/api/dashboard/b2b/summary', dashboardB2bSummary);
apiRouter.get('/api/dashboard/b2b/top-brands', dashboardB2bTopBrands);
apiRouter.get('/api/dashboard/b2b/turnover', dashboardB2bTurnover);
apiRouter.get('/api/dashboard/b2b/price-trend', dashboardB2bPriceTrend);
apiRouter.get('/api/dashboard/products', dashboardProducts);
apiRouter.post('/api/dashboard/products', dashboardCreateProduct);
apiRouter.get('/api/dashboard/customers', dashboardCustomers);
apiRouter.get('/api/dashboard/summary', dashboardSummary);
apiRouter.get('/api/dashboard/sales-trend', dashboardSalesTrend);
apiRouter.get('/api/dashboard/category-mix', dashboardCategoryMix);
apiRouter.get('/api/dashboard/top-items', dashboardTopItems);
apiRouter.get('/api/dashboard/predictive-restock', dashboardPredictiveRestock);
apiRouter.get('/api/dashboard/credit-scores', dashboardCreditScores);
apiRouter.get('/api/dashboard/crm/preview', dashboardCrmPreview);
apiRouter.get('/api/dashboard/export', dashboardExport);
