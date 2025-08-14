import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI;

export const connectDb = async () => {
  try {
    if (!mongoUri) {
      // eslint-disable-next-line no-console
      console.warn('MONGO_URI is not set. Skipping MongoDB connection.');
      return;
    }
    await mongoose.connect(mongoUri);
    // eslint-disable-next-line no-console
    console.log('Connected to MongoDB');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// connect on import for simplicity in this small project
connectDb();


