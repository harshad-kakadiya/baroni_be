import mongoose from 'mongoose';

const contactSupportSchema = new mongoose.Schema(
  {
    issueType: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

// Index for better query performances
contactSupportSchema.index({ userId: 1, createdAt: -1 });

const ContactSupport = mongoose.model('ContactSupport', contactSupportSchema);
export default ContactSupport;
