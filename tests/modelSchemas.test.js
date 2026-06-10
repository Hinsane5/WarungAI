import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { Customer, Kasbon, Product, Session, Shop, Transaction } from '../src/models/index.js';

function hasIndex(model, expectedFields, expectedOptions = {}) {
  return model.schema.indexes().some(([fields, options]) => {
    return (
      JSON.stringify(fields) === JSON.stringify(expectedFields) &&
      Object.entries(expectedOptions).every(([key, value]) => options[key] === value)
    );
  });
}

describe('Mongoose model schemas', () => {
  it('defines shop uniqueness and defaults', () => {
    expect(Shop.schema.path('ownerPhone').options.unique).toBe(true);
    expect(Shop.schema.path('loyaltyQrSlug').options.unique).toBe(true);
    expect(Shop.schema.path('dashboardToken').options.unique).toBe(true);
    expect(Shop.schema.path('tier').options.default).toBe('free');
  });

  it('defines product lookup indexes', () => {
    expect(hasIndex(Product, { shopId: 1, name: 1 }, { unique: true })).toBe(true);
    expect(hasIndex(Product, { name: 'text', aliases: 'text' })).toBe(true);
  });

  it('defines transaction idempotency and reporting indexes', () => {
    expect(hasIndex(Transaction, { whatsappMessageId: 1 }, { unique: true, sparse: true })).toBe(
      true,
    );
    expect(hasIndex(Transaction, { shopId: 1, createdAt: -1 })).toBe(true);
    expect(hasIndex(Transaction, { shopId: 1, status: 1 })).toBe(true);
  });

  it('defines customer, kasbon, and session indexes', () => {
    expect(hasIndex(Customer, { shopId: 1, phone: 1 }, { unique: true, sparse: true })).toBe(true);
    expect(hasIndex(Customer, { shopId: 1, 'rfm.segment': 1 })).toBe(true);
    expect(hasIndex(Kasbon, { shopId: 1, customerId: 1, status: 1 })).toBe(true);
    expect(hasIndex(Kasbon, { shopId: 1, status: 1, dueDate: 1 })).toBe(true);
    expect(Session.schema.path('ownerPhone').options.unique).toBe(true);
    expect(Session.schema.path('state').enumValues).toContain('awaiting_kasbon_reminder_approval');
  });

  it('keeps kasbon-reminder fields in session context (not stripped on cast)', () => {
    const customerId = new mongoose.Types.ObjectId();
    const kasbonId = new mongoose.Types.ObjectId();
    const session = new Session({
      shopId: new mongoose.Types.ObjectId(),
      ownerPhone: '+6281234567890',
      state: 'awaiting_kasbon_reminder_approval',
      context: {
        reminderCustomerId: customerId,
        reminderKasbonIds: [kasbonId],
        reminderMessage: 'Halo Budi, ini pengingat kasbon.',
      },
    });

    // If these paths were missing from the schema, Mongoose would drop them here, which
    // is what broke "tagih -> KIRIM" (the customer id was lost between the two messages).
    expect(String(session.context.reminderCustomerId)).toBe(String(customerId));
    expect(session.context.reminderKasbonIds.map(String)).toEqual([String(kasbonId)]);
    expect(session.context.reminderMessage).toContain('pengingat kasbon');
  });
});
