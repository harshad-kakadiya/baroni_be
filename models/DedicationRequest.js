import mongoose from 'mongoose';

const dedicationRequestSchema = new mongoose.Schema(
  {
    trackingId: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    fanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    starId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    occasion: {
      type: String,
      required: true,
      trim: true
    },
    eventName: {
      type: String,
      required: true,
      trim: true
    },
    eventDate: {
      type: Date,
      required: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'cancelled', 'rejected', 'completed'],
      default: 'pending',
      index: true
    },
    // Payment lifecycle for dedication request payment
    // initiated -> hybrid external part initiated
    // pending -> payment confirmed and in escrow
    // completed -> released after dedication completion
    // refunded -> refunded due to cancellation/timeout
    paymentStatus: { type: String, enum: ['initiated', 'pending', 'completed', 'refunded'], default: 'pending', index: true },
    videoUrl: {
      type: String
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      index: true
    },
    externalPaymentId: {
      type: String,
      index: true
    },
    coinAmountReserved: {
      type: Number,
      min: 0,
      default: 0
    },
    approvedAt: {
      type: Date
    },
    rejectedAt: {
      type: Date
    },
    cancelledAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },

  },
  { timestamps: true }
);

// Index for efficient queries
dedicationRequestSchema.index({ fanId: 1, status: 1 });
dedicationRequestSchema.index({ starId: 1, status: 1 });
dedicationRequestSchema.index({ createdAt: -1 });

const DedicationRequest = mongoose.model('DedicationRequest', dedicationRequestSchema);
export default DedicationRequest;
