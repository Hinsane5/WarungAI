import mongoose from 'mongoose';

// A group-buy order a warung placed against a sponsored promo — the commission event that
// monetizes the B2B Flywheel.
const promoOrderSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    promoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promo', required: true },
    brand: { type: String, trim: true },
    distributor: { type: String, trim: true },
    commissionPct: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PromoOrder =
  mongoose.models.PromoOrder ?? mongoose.model('PromoOrder', promoOrderSchema);
