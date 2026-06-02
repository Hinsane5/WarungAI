import { describe, expect, it } from 'vitest';

import {
  daysToStockout,
  evaluateStock,
  isRestockReminderDue,
  promoForSegment,
  segmentForRfm,
} from '../src/services/crmService.js';

const NOW = new Date('2026-06-02T00:00:00.000Z');
const day = (n) => new Date(NOW.getTime() + n * 86_400_000);

describe('crmService deterministic helpers', () => {
  describe('daysToStockout', () => {
    it('returns Infinity when there are no sales', () => {
      expect(daysToStockout(10, 0)).toBe(Infinity);
    });
    it('divides stock by daily sales', () => {
      expect(daysToStockout(20, 5)).toBe(4);
    });
  });

  describe('evaluateStock', () => {
    it('flags reorder point breach', () => {
      const r = evaluateStock({ product: { stock: 3, reorderPoint: 5 }, totalQtySold: 0, now: NOW });
      expect(r).toMatchObject({ flagged: true, reason: 'reorder_point' });
    });

    it('flags predicted stockout within lead time', () => {
      // 140 sold / 14d = 10/day; stock 6 -> 0.6 days left (<= 3)
      const r = evaluateStock({ product: { stock: 6 }, totalQtySold: 140, now: NOW });
      expect(r).toMatchObject({ flagged: true, reason: 'predicted_stockout' });
    });

    it('flags items expiring within the warn window', () => {
      const r = evaluateStock({
        product: { stock: 50, expiryDate: day(3) },
        totalQtySold: 0,
        now: NOW,
      });
      expect(r).toMatchObject({ flagged: true, reason: 'expiring' });
    });

    it('does not flag healthy stock', () => {
      const r = evaluateStock({ product: { stock: 100 }, totalQtySold: 14, now: NOW });
      expect(r.flagged).toBe(false);
    });
  });

  describe('segmentForRfm', () => {
    it.each([
      [{ frequency: 0, recencyDays: 999 }, 'dormant'],
      [{ frequency: 5, recencyDays: 5 }, 'champion'],
      [{ frequency: 3, recencyDays: 20 }, 'loyal'],
      [{ frequency: 1, recencyDays: 3 }, 'new'],
      [{ frequency: 1, recencyDays: 20 }, 'at_risk'],
      [{ frequency: 1, recencyDays: 60 }, 'dormant'],
    ])('%o -> %s', (rfm, expected) => {
      expect(segmentForRfm(rfm)).toBe(expected);
    });
  });

  describe('isRestockReminderDue', () => {
    it('is due when within lead time of the expected date', () => {
      expect(isRestockReminderDue({ nextExpectedDate: NOW, avgCycleDays: 7 }, { now: NOW })).toBe(
        true,
      );
    });
    it('is not due when the expected date is still far off', () => {
      expect(
        isRestockReminderDue({ nextExpectedDate: day(10), avgCycleDays: 7 }, { now: NOW }),
      ).toBe(false);
    });
    it('is not due when reminded within the cycle', () => {
      expect(
        isRestockReminderDue(
          { nextExpectedDate: day(-1), avgCycleDays: 7, lastReminderAt: day(-1) },
          { now: NOW },
        ),
      ).toBe(false);
    });
  });

  describe('promoForSegment', () => {
    it('returns a segment-specific line', () => {
      expect(promoForSegment('champion')).toMatch(/poin/i);
      expect(promoForSegment('unknown-segment')).toMatch(/mampir/i);
    });
  });
});
