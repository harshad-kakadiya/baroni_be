import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    reviewerId: { 
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
    rating: { 
      type: Number, 
      required: true, 
      min: 1, 
      max: 5 
    },
    comment: { 
      type: String, 
      trim: true, 
      maxlength: 500 
    },
    appointmentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Appointment', 
      index: true 
    },
    dedicationRequestId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'DedicationRequest', 
      index: true 
    },
    liveShowId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'LiveShow', 
      index: true 
    },
    reviewType: { 
      type: String, 
      enum: ['appointment', 'dedication', 'live_show'], 
      required: true 
    }
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
reviewSchema.index({ starId: 1, createdAt: -1 });
reviewSchema.index({ reviewerId: 1, starId: 1 });
reviewSchema.index({ reviewType: 1, createdAt: -1 });

// Ensure one review per appointment/dedication/live show per fan
reviewSchema.index({ 
  reviewerId: 1, 
  appointmentId: 1 
}, { 
  unique: true, 
  sparse: true 
});

reviewSchema.index({ 
  reviewerId: 1, 
  dedicationRequestId: 1 
}, { 
  unique: true, 
  sparse: true 
});

reviewSchema.index({ 
  reviewerId: 1, 
  liveShowId: 1 
}, { 
  unique: true, 
  sparse: true 
});

const Review = mongoose.model('Review', reviewSchema);
export default Review;
