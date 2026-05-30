import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    name: { type: String, required: true, trim: true },
    aliases: [{ type: String, trim: true }],
    unit: { type: String, trim: true },
    stock: { type: Number, default: 0 },
    costPrice: Number,
    sellPrice: Number,
    category: { type: String, trim: true },
    expiryDate: Date,
    reorderPoint: Number,
    isRoutine: { type: Boolean, default: false },
  },
  { timestamps: true },
);

productSchema.index({ shopId: 1, name: 1 });
productSchema.index({ name: 'text', aliases: 'text' });

export const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);
