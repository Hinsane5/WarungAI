import { afterEach, describe, expect, it, vi } from 'vitest';

const datasetCreate = vi.hoisted(() => vi.fn());
const datasetExists = vi.hoisted(() => vi.fn());
const tableCreate = vi.hoisted(() => vi.fn());
const tableExists = vi.hoisted(() => vi.fn());
const tableLoad = vi.hoisted(() => vi.fn());

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: vi.fn(function BigQuery() {
    this.dataset = () => ({
      exists: datasetExists,
      create: datasetCreate,
      table: () => ({ exists: tableExists, create: tableCreate, load: tableLoad }),
    });
  }),
}));

const txFind = vi.hoisted(() => vi.fn());
const shopFind = vi.hoisted(() => vi.fn());
const productFind = vi.hoisted(() => vi.fn());
const lean = (rows) => ({ lean: () => Promise.resolve(rows) });

vi.mock('../src/models/Transaction.js', () => ({ Transaction: { find: txFind } }));
vi.mock('../src/models/Shop.js', () => ({ Shop: { find: shopFind } }));
vi.mock('../src/models/Product.js', () => ({ Product: { find: productFind } }));

const { buildExportRows, exportTransactions, ensureWarehouse } = await import(
  '../src/services/bigqueryService.js'
);

describe('bigqueryService', () => {
  afterEach(() => vi.clearAllMocks());

  it('flattens transactions into per-item rows enriched with region + category', async () => {
    txFind.mockReturnValue(
      lean([
        {
          _id: 'txn-1',
          shopId: 'shop-1',
          type: 'sale',
          committedAt: new Date('2026-06-01T03:00:00.000Z'),
          items: [
            { productId: 'p1', name: 'Indomie', qty: 2, unitPrice: 3000, lineTotal: 6000 },
            { productId: 'p2', name: 'Aqua', qty: 1, unitPrice: 20000, lineTotal: 20000 },
          ],
        },
      ]),
    );
    shopFind.mockReturnValue(lean([{ _id: 'shop-1', region: 'Tangerang' }]));
    productFind.mockReturnValue(
      lean([
        { _id: 'p1', category: 'Sembako' },
        { _id: 'p2', category: 'Minuman' },
      ]),
    );

    const rows = await buildExportRows({});
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      txnId: 'txn-1',
      itemIndex: 0,
      shopId: 'shop-1',
      region: 'Tangerang',
      productName: 'Indomie',
      category: 'Sembako',
      qty: 2,
      lineTotal: 6000,
    });
    expect(rows[1]).toMatchObject({ productName: 'Aqua', category: 'Minuman', itemIndex: 1 });
  });

  it('ensures dataset + table when missing', async () => {
    datasetExists.mockResolvedValue([false]);
    tableExists.mockResolvedValue([false]);
    await ensureWarehouse();
    expect(datasetCreate).toHaveBeenCalledTimes(1);
    expect(tableCreate).toHaveBeenCalledTimes(1);
  });

  it('full-reload export loads rows with WRITE_TRUNCATE', async () => {
    datasetExists.mockResolvedValue([true]);
    tableExists.mockResolvedValue([true]);
    txFind.mockReturnValue(
      lean([
        { _id: 't1', shopId: 's1', type: 'sale', committedAt: new Date(), items: [{ name: 'X', qty: 1, lineTotal: 1000 }] },
      ]),
    );
    shopFind.mockReturnValue(lean([{ _id: 's1', region: 'Tangerang' }]));
    productFind.mockReturnValue(lean([]));

    const result = await exportTransactions({ fullReload: true });
    expect(tableLoad).toHaveBeenCalledWith(
      expect.stringMatching(/\.ndjson$/),
      expect.objectContaining({ writeDisposition: 'WRITE_TRUNCATE', sourceFormat: 'NEWLINE_DELIMITED_JSON' }),
    );
    expect(result).toEqual({ exported: 1 });
  });
});
