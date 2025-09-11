import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      index: true
    },
    payerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    description: {
      type: String
    },
    paymentMode: {
      type: String,
      enum: ['coin', 'external', 'hybrid'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['initiated', 'pending', 'completed', 'cancelled', 'refunded', 'failed'],
      default: 'initiated',
      index: true
    },
    externalPaymentId: {
      type: String,
      index: true
    },
    coinAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    externalAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    refundTimer: {
      type: Date,
      index: true
    },
    metadata: {
      type: Object
    }
  },
  { timestamps: true }
);

// Index for better query performance
transactionSchema.index({ payerId: 1, createdAt: -1 });
transactionSchema.index({ receiverId: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;






