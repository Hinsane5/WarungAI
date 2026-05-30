import { z } from 'zod';

export const extractedItemSchema = z.object({
  rawName: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().nullable().default(null),
  unitPrice: z.number().int().nonnegative().nullable().default(null),
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
