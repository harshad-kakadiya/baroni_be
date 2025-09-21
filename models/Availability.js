import mongoose from 'mongoose';

const availabilitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, trim: true }, // ISO date string (YYYY-MM-DD)
    isWeekly: { type: Boolean, default: false },
    timeSlots: {
      type: [
        new mongoose.Schema(
          {
            slot: { type: String, required: true, trim: true }, // "HH:MM - HH:MM" (24-hour format)
            status: { type: String, enum: ['available', 'unavailable'], default: 'available' },
          }
        ),
      ],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
  },
  { timestamps: true }
);

availabilitySchema.index({ userId: 1, date: 1 }, { unique: true });

const Availability = mongoose.model('Availability', availabilitySchema);
export default Availability;


