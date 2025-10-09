import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    baroniId: { type: String, unique: true, sparse: true, index: true },
    contact: { type: String, trim: true, unique: true, sparse: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    password: { type: String },
    coinBalance: { type: Number, default: 20, min: 0 },
    name: { type: String, trim: true },
    pseudo: { type: String, trim: true, unique: true, sparse: true },
    profilePic: { type: String,default: 'https://res.cloudinary.com/ddnpvm2yk/image/upload/v1759868390/placeholder_aws6oc.png' },
    preferredLanguage: { type: String },
    preferredCurrency: { type: String, default: 'F' },
    country: { type: String },
    about: { type: String, trim: true},
    location: { type: String, trim: true },
    profession: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    role: { type: String, enum: ['fan', 'star', 'admin'], default: 'fan' },
    availableForBookings: { type: Boolean, default: false },
    appNotification: { type: Boolean, default: true },
    hidden: { type: Boolean, default: false },
    fcmToken: { type: String, sparse: true, index: true },
    apnsToken: { type: String, sparse: true, index: true },
    voipToken: { type: String, sparse: true, index: true },
    deviceType: { type: String, enum: ['ios', 'android'], sparse: true, index: true },
    isDev: { type: Boolean, default: false, index: true },
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
    profileImpressions: { type: Number, default: 0, min: 0 },
    // Incremented on every successful login to invalidate old tokens
    sessionVersion: { type: Number, default: 0 },
    // Unique 7-digit numeric key for RTC/RTM token generation
    agoraKey: { type: String, unique: true, sparse: true, index: true },
    // Payment status for star promotion (initiated, pending, completed, refunded)
    paymentStatus: { type: String, enum: ['initiated', 'pending', 'completed', 'refunded'], default: null, index: true },
  },
  { timestamps: true }
);

// Pre-save hook to set default about text for star users
userSchema.pre('save', function(next) {
  // Only set default about if user is becoming a star and doesn't have an about text
  if (this.role === 'star' && (!this.about || this.about.trim() === '')) {
    this.about = "Coucou, c'est ta star 🌟 ! Je suis là pour te partager de la bonne humeur, de l'énergie et des dédicaces pleines d'amour.";
  }
  next();
});

const User = mongoose.model('User', userSchema);
export default User;


