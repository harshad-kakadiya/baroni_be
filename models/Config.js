import mongoose from 'mongoose';

const configSchema = new mongoose.Schema(
  {
    liveShowPriceHide: { type: Boolean, default: false },
    videoCallPriceHide: { type: Boolean, default: false },
    becomeBaronistarPriceHide: { type: Boolean, default: false },
    isTestUser: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Ensure only a single config document is used operationally
configSchema.statics.getSingleton = async function () {
  const existing = await this.findOne();
  if (existing) return existing;
  return this.create({});
};

const Config = mongoose.model('Config', configSchema);
export default Config;





