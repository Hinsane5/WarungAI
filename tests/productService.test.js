import { afterEach, describe, expect, it, vi } from 'vitest';

const productFindMock = vi.hoisted(() => vi.fn());
const productCreateMock = vi.hoisted(() => vi.fn());

vi.mock('../src/models/Product.js', () => ({
  Product: {
    find: productFindMock,
    create: productCreateMock,
  },
}));

const { createDashboardProduct, listDashboardProducts } =
  await import('../src/services/productService.js');

const shop = { _id: 'shop-1' };

function productQuery(products) {
  return {
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(products),
  };
}

describe('productService dashboard catalog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists products with low-stock flags and integer prices', async () => {
    productFindMock.mockReturnValue(
      productQuery([
        {
          _id: 'p1',
          name: 'Minyak Goreng 2L',
          category: 'Sembako',
          unit: 'pouch',
          stock: 4,
          sellPrice: 38000,
          costPrice: 34000,
          reorderPoint: 6,
        },
      ]),
    );

    await expect(listDashboardProducts(shop)).resolves.toEqual([
      {
        id: 'p1',
        name: 'Minyak Goreng 2L',
        category: 'Sembako',
        unit: 'pouch',
        stock: 4,
        sellPrice: 38000,
        costPrice: 34000,
        reorderPoint: 6,
        lowStock: true,
      },
    ]);
  });

  it('rejects case-insensitive duplicate product names', async () => {
    productFindMock.mockResolvedValue([{ name: 'Indomie Goreng' }]);

    await expect(
      createDashboardProduct(shop, {
        name: 'indomie goreng',
        stock: 1,
        sellPrice: 3000,
        costPrice: 2500,
        reorderPoint: 5,
      }),
    ).resolves.toEqual({ ok: false, reason: 'duplicate_product' });
    expect(productCreateMock).not.toHaveBeenCalled();
  });

  it('creates catalog products with a normalized alias', async () => {
    productFindMock.mockResolvedValue([]);
    productCreateMock.mockResolvedValue({ _id: 'p2' });

    await expect(
      createDashboardProduct(shop, {
        name: 'milo 3in1',
        category: 'Minuman',
        unit: 'sachet',
        stock: 40,
        sellPrice: 2000,
        costPrice: 1600,
        reorderPoint: 10,
      }),
    ).resolves.toEqual({ ok: true, id: 'p2' });

    expect(productCreateMock).toHaveBeenCalledWith({
      shopId: 'shop-1',
      name: 'Milo 3in1',
      aliases: ['milo 3in1'],
      unit: 'sachet',
      stock: 40,
      sellPrice: 2000,
      costPrice: 1600,
      category: 'Minuman',
      reorderPoint: 10,
    });
  });

  it('returns duplicate when MongoDB unique index wins a create race', async () => {
    productFindMock.mockResolvedValue([]);
    productCreateMock.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(
      createDashboardProduct(shop, {
        name: 'Milo 3in1',
        category: 'Minuman',
        unit: 'sachet',
        stock: 40,
        sellPrice: 2000,
        costPrice: 1600,
        reorderPoint: 10,
      }),
    ).resolves.toEqual({ ok: false, reason: 'duplicate_product' });
  });
});
