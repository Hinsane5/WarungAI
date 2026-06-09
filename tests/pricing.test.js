import { describe, expect, it } from 'vitest';

import { resolvePricing } from '../src/utils/pricing.js';

describe('resolvePricing', () => {
  it("treats a 'total' basis number as the total for the whole quantity", () => {
    // "3 telur 6000" → Rp6.000 total, Rp2.000 each
    expect(resolvePricing({ qty: 3, price: 6000, priceBasis: 'total' })).toEqual({
      unitPrice: 2000,
      lineTotal: 6000,
    });
  });

  it("treats a 'per_unit' basis number as the price of one item", () => {
    // "3 telur 3000 per butir" → Rp3.000 each, Rp9.000 total (the reported bug)
    expect(resolvePricing({ qty: 3, price: 3000, priceBasis: 'per_unit' })).toEqual({
      unitPrice: 3000,
      lineTotal: 9000,
    });
  });

  it('defaults to total when no basis is given', () => {
    expect(resolvePricing({ qty: 2, price: 10000 })).toEqual({ unitPrice: 5000, lineTotal: 10000 });
  });

  it('handles qty of 1 identically for both bases', () => {
    expect(resolvePricing({ qty: 1, price: 5000, priceBasis: 'total' })).toEqual({
      unitPrice: 5000,
      lineTotal: 5000,
    });
    expect(resolvePricing({ qty: 1, price: 5000, priceBasis: 'per_unit' })).toEqual({
      unitPrice: 5000,
      lineTotal: 5000,
    });
  });

  it('returns null when there is no price', () => {
    expect(resolvePricing({ qty: 3, price: null })).toBeNull();
  });

  it('guards against qty 0 (no divide-by-zero)', () => {
    expect(resolvePricing({ qty: 0, price: 6000, priceBasis: 'total' })).toEqual({
      unitPrice: 6000,
      lineTotal: 6000,
    });
  });
});
