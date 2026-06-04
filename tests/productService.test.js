import { afterEach, describe, expect, it, vi } from 'vitest';

const productFindMock = vi.hoisted(() => vi.fn());
const productCreateMock = vi.hoisted(() => vi.fn());

vi.mock('../src/models/Product.js', () => ({
  Product: {
    find: productFindMock,
    create: productCreateMock,
  },
}));

const { createDashboardProduct, createPricedProduct, listDashboardProducts, resolveProduct } =
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

  it('re-fetches products when chat product creation loses a duplicate-key race', async () => {
    const product = {
      _id: 'p3',
      name: 'Aqua Galon',
      aliases: ['aqua galon'],
      unit: 'galon',
    };
    productFindMock.mockResolvedValueOnce([]).mockResolvedValueOnce([product]);
    productCreateMock.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(
      resolveProduct({ shopId: 'shop-1', rawName: 'aqua galon', unit: 'galon' }),
    ).resolves.toEqual({ product, created: false, rawName: 'aqua galon' });

    expect(productFindMock).toHaveBeenCalledTimes(2);
  });

  it('rethrows duplicate-key races when the created product cannot be found', async () => {
    const error = Object.assign(new Error('duplicate'), { code: 11000 });
    productFindMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    productCreateMock.mockRejectedValue(error);

    await expect(
      resolveProduct({ shopId: 'shop-1', rawName: 'aqua galon', unit: 'galon' }),
    ).rejects.toBe(error);
  });

  it('fuzzy-matches a partial name to an existing product (gula -> Gula 1kg)', async () => {
    const product = { _id: 'g1', name: 'Gula 1kg', aliases: ['gula 1kg'], sellPrice: 16000 };
    productFindMock.mockResolvedValue([product]);

    await expect(
      resolveProduct({ shopId: 'shop-1', rawName: 'gula', unit: null }),
    ).resolves.toEqual({ product, created: false, rawName: 'gula' });
    expect(productCreateMock).not.toHaveBeenCalled();
  });

  it('picks the closest product when several share the typed word', async () => {
    const gula1kg = { _id: 'g1', name: 'Gula 1kg', aliases: ['gula 1kg'] };
    const gulaArenBesar = { _id: 'g2', name: 'Gula Aren Besar', aliases: ['gula aren besar'] };
    productFindMock.mockResolvedValue([gulaArenBesar, gula1kg]);

    const result = await resolveProduct({ shopId: 'shop-1', rawName: 'gula', unit: null });
    expect(result.product).toBe(gula1kg); // fewer extra words than "Gula Aren Besar"
  });

  it('does not fuzzy-match when the typed name is more specific than any product', async () => {
    const product = { _id: 'g1', name: 'Gula 1kg', aliases: ['gula 1kg'] };
    productFindMock.mockResolvedValue([product]);
    productCreateMock.mockResolvedValue([{ _id: 'new', name: 'Gula Aren', aliases: ['gula aren'] }]);

    const result = await resolveProduct({ shopId: 'shop-1', rawName: 'gula aren', unit: null });
    expect(result.created).toBe(true);
    expect(productCreateMock).toHaveBeenCalled();
  });

  it('can resolve without creating missing chat products', async () => {
    productFindMock.mockResolvedValue([]);

    await expect(
      resolveProduct(
        { shopId: 'shop-1', rawName: 'milo 500 gram', unit: 'dus' },
        { createIfMissing: false },
      ),
    ).resolves.toEqual({ product: null, created: false, rawName: 'milo 500 gram' });
    expect(productCreateMock).not.toHaveBeenCalled();
  });

  it('creates priced products from price clarification replies', async () => {
    const product = { _id: 'p4', name: 'Milo 500 Gram' };
    productFindMock.mockResolvedValue([]);
    productCreateMock.mockResolvedValue([product]);

    await expect(
      createPricedProduct({
        shopId: 'shop-1',
        rawName: 'milo 500 gram',
        unit: 'dus',
        costPrice: 120000,
        sellPrice: 150000,
      }),
    ).resolves.toBe(product);

    expect(productCreateMock).toHaveBeenCalledWith(
      [
        {
          shopId: 'shop-1',
          name: 'Milo 500 Gram',
          aliases: ['milo 500 gram'],
          unit: 'dus',
          stock: 0,
          sellPrice: 150000,
          costPrice: 120000,
        },
      ],
      undefined,
    );
  });

  it('uses an existing product during priced creation instead of inserting a duplicate', async () => {
    const product = {
      _id: 'p5',
      name: 'Pocari 1 Liter',
      aliases: ['pocari 1 liter'],
      unit: 'dus',
      stock: 3,
      sellPrice: undefined,
      costPrice: undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
    productFindMock.mockResolvedValue([product]);

    await expect(
      createPricedProduct({
        shopId: 'shop-1',
        rawName: 'pocari 1 liter',
        unit: 'dus',
        costPrice: 120000,
        sellPrice: 5000,
      }),
    ).resolves.toBe(product);

    expect(productCreateMock).not.toHaveBeenCalled();
    expect(product.costPrice).toBe(120000);
    expect(product.sellPrice).toBe(5000);
    expect(product.save).toHaveBeenCalledWith(undefined);
  });
});
