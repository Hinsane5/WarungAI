import mongoose from 'mongoose';

// A sponsored distributor/principal offer (the B2B "Targeted Promo" product). Region-scoped
// and brand-matched — injected into warung stock-check replies in the matching region.
const promoSchema = new mongoose.Schema(
  {
    brand: { type: String, trim: true, required: true },
    distributor: { type: String, trim: true, required: true },
    offer: { type: String, trim: true, required: true },
    region: { type: String, trim: true, default: 'all' },
    commissionPct: { type: Number, default: 5, min: 0, max: 100 },
    activeUntil: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

promoSchema.index({ brand: 1, region: 1, active: 1 });

export const Promo = mongoose.models.Promo ?? mongoose.model('Promo', promoSchema);
