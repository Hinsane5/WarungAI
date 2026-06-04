import { Customer } from '../models/Customer.js';
import { Kasbon } from '../models/Kasbon.js';
import { refreshCustomerCreditScore } from '../services/kasbonService.js';
import { logger } from '../utils/logger.js';

// Nightly: recompute the behavioral credit score for every customer who has kasbons,
// so an aging/overdue debt updates their band even without a new transaction.
export async function runCreditScoreRefresh({ now = new Date(), shopIds = null } = {}) {
  const customerIds = await Kasbon.distinct('customerId');
  const customerFilter = { _id: { $in: customerIds } };
  if (shopIds) {
    customerFilter.shopId = { $in: shopIds };
  }
  const customers = await Customer.find(customerFilter);

  let customersScored = 0;
  for (const customer of customers) {
    await refreshCustomerCreditScore(customer, { now });
    customersScored += 1;
  }

  logger.info({ customersScored }, 'creditScoreRefresh complete');
  return { customersScored };
}
