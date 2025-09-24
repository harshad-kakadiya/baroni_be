import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    title: { 
      type: String, 
      required: true,
      trim: true 
    },
    body: { 
      type: String, 
      required: true,
      trim: true 
    },
    type: { 
      type: String, 
      enum: [
        'appointment', 
        'payment', 
        'rating', 
        'live_show', 
        'dedication', 
        'message', 
        'general',
          'voip'
      ], 
      required: true,
      index: true 
    },
    data: { 
      type: mongoose.Schema.Types.Mixed, 
      default: {} 
    },
    // Arbitrary JSON string provided by frontend to be stored as-is
    customPayload: {
      type: String
    },
    sentAt: { 
      type: Date, 
      default: Date.now,
      index: true 
    },
    fcmMessageId: { 
      type: String, 
      sparse: true 
    },
    deliveryStatus: { 
      type: String, 
      enum: ['pending', 'sent', 'delivered', 'failed'], 
      default: 'pending',
      index: true 
    },
    failureReason: { 
      type: String 
    },
    // Reference to related entities
    relatedEntity: {
      type: { 
        type: String, 
        enum: ['appointment', 'transaction', 'dedication', 'live_show', 'message', 'rating'] 
      },
      id: { type: mongoose.Schema.Types.ObjectId }
    },
    // Expiration date for the notification
    expiresAt: { 
      type: Date,
      index: { expireAfterSeconds: 0 } // TTL index
    }
  },
  { 
    timestamps: true 
  }
);

// Indexes for better query performance
notificationSchema.index({ user: 1, sentAt: -1 });
notificationSchema.index({ user: 1, type: 1, sentAt: -1 });
notificationSchema.index({ deliveryStatus: 1, sentAt: 1 });

// Virtual for time ago
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffInSeconds = Math.floor((now - this.sentAt) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds}s ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
});



const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
