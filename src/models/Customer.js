import mongoose from 'mongoose';

const restockPredictionSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    avgCycleDays: Number,
    nextExpectedDate: Date,
    lastReminderAt: Date,
  },
  { _id: false },
);

const customerSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    phone: { type: String, trim: true },
    name: { type: String, trim: true },
    aliases: [{ type: String, trim: true }],
    loyalty: {
      points: { type: Number, default: 0 },
      stamps: { type: Number, default: 0 },
      joinedVia: { type: String, enum: ['qr', 'manual'], default: 'qr' },
    },
    rfm: {
      recencyDays: Number,
      frequency: Number,
      monetary: Number,
      segment: String,
    },
    creditScore: {
      value: Number,
      band: { type: String, enum: ['good', 'watch', 'risky'], default: 'good' },
      updatedAt: Date,
    },
    restockPredictions: [restockPredictionSchema],
    optInBroadcast: { type: Boolean, default: true },
  },
  { timestamps: true },
);

customerSchema.index({ shopId: 1, phone: 1 }, { unique: true, sparse: true });
customerSchema.index({ shopId: 1, 'rfm.segment': 1 });

export const Customer = mongoose.models.Customer ?? mongoose.model('Customer', customerSchema);
