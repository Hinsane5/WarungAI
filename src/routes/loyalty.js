import { Router } from 'express';

import { registerLoyalty, renderLoyaltyPage } from '../controllers/loyaltyController.js';

export const loyaltyRouter = Router();

loyaltyRouter.get('/loyalty/:slug', renderLoyaltyPage);
loyaltyRouter.post('/api/loyalty/register', registerLoyalty);
