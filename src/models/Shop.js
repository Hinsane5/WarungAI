import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    ownerPhone: { type: String, required: true, trim: true, unique: true },
    ownerName: { type: String, trim: true },
    tier: { type: String, enum: ['free', 'premium'], default: 'free' },
    settings: {
      locale: { type: String, default: 'id-ID' },
      currency: { type: String, default: 'IDR' },
      timezone: { type: String, default: 'Asia/Jakarta' },
    },
    quotas: {
      dailyTxnCount: { type: Number, default: 0 },
      dailyTxnDate: String,
      koinBotBalance: { type: Number, default: 0 },
    },
    loyaltyQrSlug: { type: String, required: true, trim: true, unique: true },
    dashboardToken: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true },
);

export const Shop = mongoose.models.Shop ?? mongoose.model('Shop', shopSchema);
