import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

const Service = mongoose.model('Service', serviceSchema);
export default Service;











