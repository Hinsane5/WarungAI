import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    ownerPhone: { type: String, required: true, trim: true, unique: true },
    ownerName: { type: String, trim: true },
    region: { type: String, trim: true, default: 'Tangerang' },
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
    // Owner-configurable daily evaluation time (in the shop's timezone). When unset, the
    // scheduler falls back to the global default. lastEvaluationDate (YYYY-MM-DD in shop tz)
    // makes the daily run idempotent so an every-minute scheduler runs it once per day.
    evaluationSchedule: {
      hour: { type: Number, min: 0, max: 23 },
      minute: { type: Number, min: 0, max: 59 },
    },
    lastEvaluationDate: { type: String },
    loyaltyQrSlug: { type: String, required: true, trim: true, unique: true },
    dashboardToken: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true },
);

export const Shop = mongoose.models.Shop ?? mongoose.model('Shop', shopSchema);
