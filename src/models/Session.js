import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    ownerPhone: { type: String, required: true, trim: true, unique: true },
    state: {
      type: String,
      enum: [
        'idle',
        'awaiting_confirmation',
        'awaiting_kasbon_reminder_approval',
        'awaiting_promo_order',
        'correcting',
        'clarifying',
        'fast_text_fallback',
      ],
      default: 'idle',
    },
    context: {
      pendingTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
      failureCount: { type: Number, default: 0 },
      lastQuestion: String,
      pendingPriceItem: { type: mongoose.Schema.Types.Mixed },
      pendingPriceUpdate: { type: mongoose.Schema.Types.Mixed },
      pendingPromoOrder: { type: mongoose.Schema.Types.Mixed },
    },
    // Set when an abandoned in-flight flow is auto-cancelled; the next inbound message
    // tells the owner it didn't complete, then clears this.
    expiredNotice: { type: String },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema);
