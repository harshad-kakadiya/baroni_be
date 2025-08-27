import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['credit', 'debit', 'transfer'], required: true, index: true },
    payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String },
    paymentMode: { type: String, enum: ['coin', 'external'], required: true, index: true },
    metadata: { type: Object },
  },
  { timestamps: true }
);

transactionSchema.index({ payerId: 1, createdAt: -1 });
transactionSchema.index({ receiverId: 1, createdAt: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;


