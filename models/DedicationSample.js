import mongoose from 'mongoose';

const dedicationSampleSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    video: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

const DedicationSample = mongoose.model('DedicationSample', dedicationSampleSchema);
export default DedicationSample;





