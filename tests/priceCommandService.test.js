import { afterEach, describe, expect, it, vi } from 'vitest';

const sendTextMock = vi.hoisted(() => vi.fn());
const findProductByNameMock = vi.hoisted(() => vi.fn());
const updateProductPriceMock = vi.hoisted(() => vi.fn());
const setSessionStateMock = vi.hoisted(() => vi.fn());

vi.mock('../src/messaging/whatsapp.js', () => ({
  sendText: sendTextMock,
}));

vi.mock('../src/services/productService.js', () => ({
  findProductByName: findProductByNameMock,
  updateProductPrice: updateProductPriceMock,
}));

vi.mock('../src/services/sessionService.js', () => ({
  setSessionState: setSessionStateMock,
}));

const {
  handlePendingPriceUpdateReply,
  handlePriceUpdateCommand,
  parsePriceUpdateCommand,
} = await import('../src/services/priceCommandService.js');

function createShop() {
  return { _id: 'shop-1' };
}

function createSession(overrides = {}) {
  return {
    _id: 'session-1',
    state: 'idle',
    context: {},
    ...overrides,
  };
}

describe('priceCommandService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('parses price update commands without treating product weight as price', () => {
    expect(parsePriceUpdateCommand('ubah harga jual beras 15kg')).toEqual({
      priceType: 'sellPrice',
      rawName: 'beras 15kg',
      price: null,
    });
    expect(parsePriceUpdateCommand('ubah modal beli beras 15kg jadi 65000')).toEqual({
      priceType: 'costPrice',
      rawName: 'beras 15kg',
      price: 65000,
    });
  });

  it('asks for the new price when command has no price value', async () => {
    const product = { _id: 'product-1', name: 'Beras 15 Kg' };
    findProductByNameMock.mockResolvedValue(product);
    const session = createSession();

    const result = await handlePriceUpdateCommand({
      shop: createShop(),
      session,
      message: {
        from: '+6281234567890',
        text: 'ubah harga jual beras 15kg',
      },
    });

    expect(setSessionStateMock).toHaveBeenCalledWith(session, 'clarifying', {
      lastQuestion: expect.stringContaining('harga jual baru untuk Beras 15 Kg'),
      pendingPriceUpdate: {
        productId: 'product-1',
        productName: 'Beras 15 Kg',
        priceType: 'sellPrice',
      },
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('Balas angka saja'),
    );
    expect(updateProductPriceMock).not.toHaveBeenCalled();
    expect(result.action).toBe('clarifying_price_update');
  });

  it('updates the product price from the follow-up reply', async () => {
    const product = { _id: 'product-1', name: 'Beras 15 Kg', sellPrice: 15000 };
    updateProductPriceMock.mockResolvedValue(product);
    const session = createSession({
      state: 'clarifying',
      context: {
        pendingPriceUpdate: {
          productId: 'product-1',
          productName: 'Beras 15 Kg',
          priceType: 'sellPrice',
        },
      },
    });

    const result = await handlePendingPriceUpdateReply({
      shop: createShop(),
      session,
      message: {
        from: '+6281234567890',
        text: '15000',
      },
    });

    expect(updateProductPriceMock).toHaveBeenCalledWith({
      shopId: 'shop-1',
      productId: 'product-1',
      priceType: 'sellPrice',
      price: 15000,
    });
    expect(setSessionStateMock).toHaveBeenCalledWith(session, 'idle', {
      pendingPriceUpdate: undefined,
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      '+6281234567890',
      expect.stringContaining('harga jual Beras 15 Kg diubah menjadi'),
    );
    expect(result.action).toBe('price_updated');
  });
});
