import mongoose from 'mongoose';

const transactionItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true },
    unit: { type: String, trim: true },
    unitPrice: Number,
    lineTotal: Number,
  },
  { _id: false },
);

const transactionSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    type: {
      type: String,
      enum: ['sale', 'stock_in', 'expense', 'adjustment'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'committed', 'cancelled'],
      default: 'pending',
    },
    source: { type: String, enum: ['text', 'voice'], default: 'text' },
    rawMessage: String,
    whatsappMessageId: String,
    sttConfidence: Number,
    extractionConfidence: Number,
    items: [transactionItemSchema],
    totalAmount: Number,
    cashDelta: Number,
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    committedAt: Date,
  },
  { timestamps: true },
);

transactionSchema.index({ shopId: 1, createdAt: -1 });
transactionSchema.index({ whatsappMessageId: 1 }, { unique: true, sparse: true });
transactionSchema.index({ shopId: 1, status: 1 });

export const Transaction =
  mongoose.models.Transaction ?? mongoose.model('Transaction', transactionSchema);
