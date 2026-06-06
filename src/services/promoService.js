import { Promo } from '../models/Promo.js';
import { PromoOrder } from '../models/PromoOrder.js';

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function lean(query) {
  return typeof query.lean === 'function' ? query.lean() : query;
}

export async function createPromo(input) {
  const promo = await Promo.create({
    brand: String(input.brand ?? '').trim(),
    distributor: String(input.distributor ?? '').trim(),
    offer: String(input.offer ?? '').trim(),
    region: String(input.region ?? '').trim() || 'all',
    commissionPct: input.commissionPct ?? 5,
    activeUntil: input.activeUntil ? new Date(input.activeUntil) : undefined,
    active: true,
  });
  return { ok: true, id: String(promo._id) };
}

export async function listPromos() {
  const promos = await lean(Promo.find({}).sort({ createdAt: -1 }).limit(50));
  return promos.map((promo) => ({
    id: String(promo._id),
    brand: promo.brand,
    distributor: promo.distributor,
    offer: promo.offer,
    region: promo.region ?? 'all',
    commissionPct: promo.commissionPct ?? 0,
    activeUntil: promo.activeUntil ? new Date(promo.activeUntil).toISOString().slice(0, 10) : null,
    active: promo.active !== false,
  }));
}

// Find an active promo whose brand matches the product name in the shop's region.
export async function findActivePromoForProduct({ region, productName, now = new Date() }) {
  const candidates = await lean(
    Promo.find({
      active: true,
      $and: [
        { $or: [{ region: region ?? 'all' }, { region: 'all' }] },
        { $or: [{ activeUntil: { $exists: false } }, { activeUntil: { $gte: now } }] },
      ],
    }),
  );

  const target = normalize(productName);
  if (!target) {
    return null;
  }

  return (
    candidates.find((promo) => {
      const brand = normalize(promo.brand);
      return brand && (target.includes(brand) || brand.includes(target));
    }) ?? null
  );
}

export async function recordPromoOrder({ shop, promo }) {
  await PromoOrder.create({
    shopId: shop._id,
    promoId: promo._id ?? promo.id,
    brand: promo.brand,
    distributor: promo.distributor,
    commissionPct: promo.commissionPct ?? 0,
  });
  return { distributor: promo.distributor, commissionPct: promo.commissionPct ?? 0 };
}

export function formatPromoLine(promo) {
  return `${promo.distributor} lagi promo ${promo.brand}: ${promo.offer}.`;
}
