import mongoose from 'mongoose';

const reportUserSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
  },
  { timestamps: true }
);

reportUserSchema.index({ reporterId: 1, reportedUserId: 1, createdAt: -1 });

const ReportUser = mongoose.model('ReportUser', reportUserSchema);
export default ReportUser;
