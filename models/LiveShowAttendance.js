import mongoose from 'mongoose';

const liveShowAttendanceSchema = new mongoose.Schema(
  {
    liveShowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveShow',
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
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
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
    attendanceFee: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled', 'refunded'],
      default: 'pending',
      index: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    cancelledAt: {
      type: Date
    },
    refundedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Indexes for efficient queries
liveShowAttendanceSchema.index({ liveShowId: 1, fanId: 1 }, { unique: true });
liveShowAttendanceSchema.index({ fanId: 1, status: 1 });
liveShowAttendanceSchema.index({ starId: 1, status: 1 });
liveShowAttendanceSchema.index({ transactionId: 1 });

const LiveShowAttendance = mongoose.model('LiveShowAttendance', liveShowAttendanceSchema);
export default LiveShowAttendance;
