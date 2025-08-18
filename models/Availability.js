import mongoose from 'mongoose';

// Availability for stars: a date, one or more time slots, and a status
// Example timeSlots: ["09:00-10:00", "14:00-15:30"]
const availabilitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, trim: true }, // ISO date string (YYYY-MM-DD)
    timeSlots: {
      type: [
        new mongoose.Schema(
          {
            slot: { type: String, required: true, trim: true }, // "HH:MM AM/PM - HH:MM AM/PM"
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


