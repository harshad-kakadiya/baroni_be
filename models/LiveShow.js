import mongoose from 'mongoose';

const liveShowSchema = new mongoose.Schema(
  {
    sessionTitle: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    date: {
      type: Date,
      required: true
    },
    time: {
      type: String,
      required: true,
      trim: true
    },
    attendanceFee: {
      type: Number,
      required: true,
      min: 0
    },
    hostingPrice: {
      type: Number,
      required: true,
      min: 0
    },
    maxCapacity: {
      type: Number,
      default: -1, // -1 represents unlimited
      min: -1
    },
    showCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    inviteLink: {
      type: String,
      required: true,
      trim: true
    },
    starId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending'
    },
    currentAttendees: {
      type: Number,
      default: 0,
      min: 0
    },
    attendees: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    }],
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    thumbnail: {
      type: String
    }
    ,
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      index: true
    },
    hostingPaymentMode: {
      type: String,
      enum: ['coin', 'external']
    },
    hostingPaymentDescription: {
      type: String
    }
  },
  { timestamps: true }
);

// Index for efficient queries
liveShowSchema.index({ starId: 1, date: 1 });
liveShowSchema.index({ status: 1, date: 1 });

// Users who liked the show
liveShowSchema.add({
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }]
});

// Virtual for checking if show is at capacity
liveShowSchema.virtual('isAtCapacity').get(function() {
  if (this.maxCapacity === -1) return false; // Unlimited
  return this.currentAttendees >= this.maxCapacity;
});

// Virtual for checking if show is upcoming (pending in future)
liveShowSchema.virtual('isUpcoming').get(function() {
  return this.date > new Date() && this.status === 'pending';
});

const LiveShow = mongoose.model('LiveShow', liveShowSchema);
export default LiveShow;
