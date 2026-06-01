import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveShopByLoyaltySlugMock = vi.hoisted(() => vi.fn());
const buildLoyaltyQrUrlMock = vi.hoisted(() => vi.fn());
const registerLoyaltyCustomerMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/loyaltyService.js', () => ({
  resolveShopByLoyaltySlug: resolveShopByLoyaltySlugMock,
  buildLoyaltyQrUrl: buildLoyaltyQrUrlMock,
  registerLoyaltyCustomer: registerLoyaltyCustomerMock,
}));

const { app } = await import('../src/app.js');

describe('loyalty routes', () => {
  beforeEach(() => {
    resolveShopByLoyaltySlugMock.mockResolvedValue({
      _id: 'shop-1',
      name: 'Warung Sri',
      loyaltyQrSlug: 'warung-static-slug',
    });
    buildLoyaltyQrUrlMock.mockReturnValue('https://example.test/loyalty/warung-static-slug');
    registerLoyaltyCustomerMock.mockResolvedValue({
      ok: true,
      shop: { name: 'Warung Sri' },
      customer: {
        loyalty: { stamps: 1, points: 1 },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a lightweight loyalty registration page for a valid slug', async () => {
    const response = await request(app).get('/loyalty/warung-static-slug').expect(200);

    expect(response.text).toContain('Warung Sri');
    expect(response.text).toContain('name="slug" type="hidden" value="warung-static-slug"');
    expect(response.text).toContain('/api/loyalty/register');
    expect(response.headers['cache-control']).toBe('public, max-age=300');
  });

  it('returns 404 for an unknown loyalty slug', async () => {
    resolveShopByLoyaltySlugMock.mockResolvedValue(null);

    await request(app).get('/loyalty/missing').expect(404);
  });

  it('registers a customer from the loyalty form API', async () => {
    const response = await request(app)
      .post('/api/loyalty/register')
      .send({
        slug: 'warung-static-slug',
        phone: '08111222333',
        name: 'Budi',
      })
      .expect(200);

    expect(registerLoyaltyCustomerMock).toHaveBeenCalledWith({
      slug: 'warung-static-slug',
      phone: '08111222333',
      name: 'Budi',
    });
    expect(response.body).toEqual({
      ok: true,
      shopName: 'Warung Sri',
      stamps: 1,
      points: 1,
    });
  });

  it('maps registration validation failures to HTTP responses', async () => {
    registerLoyaltyCustomerMock.mockResolvedValueOnce({ ok: false, reason: 'invalid_phone' });

    await request(app)
      .post('/api/loyalty/register')
      .send({ slug: 'warung-static-slug', phone: 'bad' })
      .expect(400, { ok: false, error: 'invalid_phone' });

    registerLoyaltyCustomerMock.mockResolvedValueOnce({ ok: false, reason: 'shop_not_found' });

    await request(app)
      .post('/api/loyalty/register')
      .send({ slug: 'missing', phone: '08111222333' })
      .expect(404, { ok: false, error: 'shop_not_found' });
  });
});
