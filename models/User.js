import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    baroniId: { type: String, unique: true, required: true, index: true },
    contact: { type: String, trim: true, unique: true, sparse: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    password: { type: String },
    coinBalance: { type: Number, default: 0, min: 0 },
    name: { type: String, trim: true },
    pseudo: { type: String, trim: true, unique: true, sparse: true },
    profilePic: { type: String },
    preferredLanguage: { type: String },
    preferredCurrency: { type: String, default: 'USD' },
    country: { type: String },
    about: { type: String, trim: true},
    location: { type: String, trim: true },
    profession: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    role: { type: String, enum: ['fan', 'star', 'admin'], default: 'fan' },
    availableForBookings: { type: Boolean, default: false },
    appNotification: { type: Boolean, default: true },
    fcmToken: { type: String, sparse: true, index: true },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    providers: {
      google: {
        id: { type: String, index: true },
      },
      apple: {
        id: { type: String, index: true },
      },
    },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
  },
  { timestamps: true }
);


const User = mongoose.model('User', userSchema);
export default User;


