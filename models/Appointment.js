import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    starId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fanId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    availabilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Availability', required: true, index: true },
    timeSlotId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'], default: 'pending', index: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    externalPaymentId: { type: String, index: true },
    coinAmountReserved: { type: Number, min: 0, default: 0 },
    completedAt: { type: Date },
    callDuration: { type: Number, min: 0 }, // Duration in minutes
  },
  { timestamps: true }
);

appointmentSchema.index({ starId: 1, date: 1 });
appointmentSchema.index({ transactionId: 1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);
export default Appointment;






