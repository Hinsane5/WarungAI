import mongoose from 'mongoose';

const kasbonItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true },
    unit: { type: String, trim: true },
    unitPrice: Number,
    lineTotal: Number,
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    paidAt: { type: Date, default: Date.now },
    note: String,
  },
  { _id: false },
);

const reminderSchema = new mongoose.Schema(
  {
    sentAt: { type: Date, default: Date.now },
    channel: String,
    approvedByOwner: { type: Boolean, default: false },
  },
  { _id: false },
);

const kasbonSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: { type: String, enum: ['open', 'settled'], default: 'open' },
    items: [kasbonItemSchema],
    amount: { type: Number, required: true },
    originalAmount: { type: Number, required: true },
    dueDate: Date,
    payments: [paymentSchema],
    remindersSent: [reminderSchema],
  },
  { timestamps: true },
);

kasbonSchema.index({ shopId: 1, customerId: 1, status: 1 });
kasbonSchema.index({ shopId: 1, status: 1, dueDate: 1 });

export const Kasbon = mongoose.models.Kasbon ?? mongoose.model('Kasbon', kasbonSchema);
