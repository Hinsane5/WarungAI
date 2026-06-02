import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shopFindOneMock = vi.hoisted(() => vi.fn());
const shopCreateMock = vi.hoisted(() => vi.fn());

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}));

vi.mock('../src/models/Shop.js', () => ({
  Shop: {
    findOne: shopFindOneMock,
    create: shopCreateMock,
  },
}));

const {
  buildDefaultShopName,
  findOrCreateByOwnerPhone,
  generateDashboardToken,
  generateLoyaltyQrSlug,
} = await import('../src/services/shopService.js');

describe('shopService', () => {
  beforeEach(() => {
    vi.mocked(randomUUID).mockReturnValue('12345678-1234-1234-1234-123456789abc');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds a default shop name from owner name or fallback text', () => {
    expect(buildDefaultShopName('Bu Sri')).toBe('Warung Bu Sri');
    expect(buildDefaultShopName()).toBe('Warung Baru');
  });

  it('generates a stable loyalty slug format', () => {
    expect(generateLoyaltyQrSlug()).toBe('warung-123456781234');
  });

  it('generates a stable dashboard token format', () => {
    expect(generateDashboardToken()).toBe('dash_12345678123412341234123456789abc');
  });

  it('returns an existing shop without creating another one', async () => {
    const existingShop = {
      _id: 'shop-1',
      ownerPhone: '+6281234567890',
      dashboardToken: 'dash_existing',
    };
    shopFindOneMock.mockResolvedValue(existingShop);

    const result = await findOrCreateByOwnerPhone({
      ownerPhone: '0812-3456-7890',
      ownerName: 'Bu Sri',
    });

    expect(shopFindOneMock).toHaveBeenCalledWith({ ownerPhone: '+081234567890' });
    expect(shopCreateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ shop: existingShop, created: false });
  });

  it('backfills a dashboard token on an existing legacy shop', async () => {
    const existingShop = { _id: 'shop-1', ownerPhone: '+6281234567890', save: vi.fn() };
    shopFindOneMock.mockResolvedValue(existingShop);

    const result = await findOrCreateByOwnerPhone({
      ownerPhone: '+6281234567890',
      ownerName: 'Bu Sri',
    });

    expect(existingShop.dashboardToken).toBe('dash_12345678123412341234123456789abc');
    expect(existingShop.save).toHaveBeenCalledOnce();
    expect(result).toEqual({ shop: existingShop, created: false });
  });

  it('creates a new shop when no existing owner phone is found', async () => {
    const createdShop = { _id: 'shop-1', ownerPhone: '+6281234567890' };
    shopFindOneMock.mockResolvedValue(null);
    shopCreateMock.mockResolvedValue(createdShop);

    const result = await findOrCreateByOwnerPhone({
      ownerPhone: '+6281234567890',
      ownerName: 'Bu Sri',
    });

    expect(shopCreateMock).toHaveBeenCalledWith({
      name: 'Warung Bu Sri',
      ownerPhone: '+6281234567890',
      ownerName: 'Bu Sri',
      loyaltyQrSlug: 'warung-123456781234',
      dashboardToken: 'dash_12345678123412341234123456789abc',
    });
    expect(result).toEqual({ shop: createdShop, created: true });
  });

  it('re-fetches a shop after a duplicate-key race on create', async () => {
    const racedShop = { _id: 'shop-2', ownerPhone: '+6281234567890' };
    shopFindOneMock.mockResolvedValueOnce(null).mockResolvedValueOnce(racedShop);
    shopCreateMock.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

    const result = await findOrCreateByOwnerPhone({
      ownerPhone: '+6281234567890',
      ownerName: 'Bu Sri',
    });

    expect(shopFindOneMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ shop: racedShop, created: false });
  });

  it('rethrows non-duplicate create errors', async () => {
    const error = new Error('db down');
    shopFindOneMock.mockResolvedValue(null);
    shopCreateMock.mockRejectedValue(error);

    await expect(
      findOrCreateByOwnerPhone({ ownerPhone: '+6281234567890', ownerName: 'Bu Sri' }),
    ).rejects.toThrow(error);
  });
});
