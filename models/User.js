import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    contact: { type: String, trim: true, unique: true, sparse: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    password: { type: String },
    name: { type: String, trim: true },
    pseudo: { type: String, trim: true, unique: true, sparse: true },
    profilePic: { type: String },
    preferredLanguage: { type: String, enum: ['en', 'fr', 'es', 'de', 'it', 'pt', 'ar', 'zh', 'ja', 'ko'], default: 'en' },
    country: { type: String },
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

// Unique indexes are defined on fields above with `unique: true` and `sparse: true` to allow nulls

const User = mongoose.model('User', userSchema);
export default User;


