import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    contact: { type: String, trim: true, unique: true, sparse: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    password: { type: String },
    name: { type: String, trim: true },
    pseudo: { type: String, trim: true, unique: true, sparse: true },
    profilePic: { type: String },
    preferredLanguage: { type: String },
    country: { type: String },
    about: { type: String, trim: true},
    location: { type: String, trim: true },
    profession: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    role: { type: String, enum: ['fan', 'star', 'admin'], default: 'fan' },
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


