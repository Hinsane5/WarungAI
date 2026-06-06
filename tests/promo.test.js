import { describe, expect, it, vi } from 'vitest';

const promoFindMock = vi.hoisted(() => vi.fn());
const promoCreateMock = vi.hoisted(() => vi.fn());
const promoOrderCreateMock = vi.hoisted(() => vi.fn());

vi.mock('../src/models/Promo.js', () => ({
  Promo: { find: promoFindMock, create: promoCreateMock },
}));
vi.mock('../src/models/PromoOrder.js', () => ({
  PromoOrder: { create: promoOrderCreateMock },
}));

const { findActivePromoForProduct, formatPromoLine } = await import(
  '../src/services/promoService.js'
);
const { parseStockCheckCommand, parsePromoConfirm, parsePromoDecline } = await import(
  '../src/services/stockCommandService.js'
);

function asQuery(rows) {
  return { lean: () => Promise.resolve(rows) };
}

describe('stock-check + promo command parsing', () => {
  it('parses "cek stok <produk>" and "stok <produk>"', () => {
    expect(parseStockCheckCommand('cek stok indomie')).toBe('indomie');
    expect(parseStockCheckCommand('stok aqua galon')).toBe('aqua galon');
    expect(parseStockCheckCommand('laku 2 indomie')).toBeNull();
  });

  it('recognizes promo confirm/decline replies', () => {
    expect(parsePromoConfirm('ya')).toBe(true);
    expect(parsePromoConfirm('pesan')).toBe(true);
    expect(parsePromoConfirm('laku 2 indomie')).toBe(false);
    expect(parsePromoDecline('tidak')).toBe(true);
    expect(parsePromoDecline('batal')).toBe(true);
  });
});

describe('findActivePromoForProduct', () => {
  it('matches a promo brand to a fuller product name', async () => {
    promoFindMock.mockReturnValue(
      asQuery([
        { _id: 'p1', brand: 'Indomie', distributor: 'Agen Sinar Jaya', offer: 'beli 10 gratis 1', commissionPct: 5 },
      ]),
    );
    const promo = await findActivePromoForProduct({
      region: 'Tangerang',
      productName: 'Indomie Goreng',
    });
    expect(promo?.distributor).toBe('Agen Sinar Jaya');
    expect(formatPromoLine(promo)).toContain('beli 10 gratis 1');
  });

  it('returns null when no brand matches the product', async () => {
    promoFindMock.mockReturnValue(asQuery([{ _id: 'p2', brand: 'Aqua', distributor: 'Y', offer: 'x' }]));
    const promo = await findActivePromoForProduct({
      region: 'Tangerang',
      productName: 'Indomie Goreng',
    });
    expect(promo).toBeNull();
  });
});
