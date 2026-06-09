import { z } from 'zod';

export const extractedItemSchema = z.object({
  rawName: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().nullable().default(null),
  // The rupiah amount the owner stated (raw, not divided/multiplied). `priceBasis` says
  // whether that amount is the total for the whole quantity or the price of one item.
  unitPrice: z.number().int().nonnegative().nullable().default(null),
  priceBasis: z.enum(['total', 'per_unit']).default('total'),
  action: z.enum(['sale', 'stock_in']),
});

export const extractionResultSchema = z.object({
  intent: z.enum(['pos', 'kasbon', 'query', 'unknown']),
  transactionType: z.enum(['sale', 'stock_in', 'expense']).nullable().default(null),
  items: z.array(extractedItemSchema).default([]),
  customerRef: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().nullable().default(null),
});
