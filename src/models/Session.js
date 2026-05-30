import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    ownerPhone: { type: String, required: true, trim: true, unique: true },
    state: {
      type: String,
      enum: ['idle', 'awaiting_confirmation', 'correcting', 'clarifying', 'fast_text_fallback'],
      default: 'idle',
    },
    context: {
      pendingTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
      failureCount: { type: Number, default: 0 },
      lastQuestion: String,
    },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema);
