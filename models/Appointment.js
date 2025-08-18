import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    starId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fanId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    availabilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Availability', required: true, index: true },
    timeSlotId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
  },
  { timestamps: true }
);

appointmentSchema.index({ starId: 1, date: 1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);
export default Appointment;


