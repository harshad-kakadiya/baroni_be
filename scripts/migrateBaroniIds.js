import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import { generateUniqueBaroniId } from '../utils/baroniIdGenerator.js';

// Load environment variables
dotenv.config();

// Use the same MongoDB URI as the main application
const MONGODB_URI = process.env.MONGO_URI;

async function migrateBaroniIds() {
  try {
    if (!MONGODB_URI) {
      console.error('MONGO_URI environment variable is not set!');
      console.log('Please set MONGO_URI in your .env file or environment variables');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    console.log('URI:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Hide credentials in logs
    
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully');

    // Find users without baroniId
    const usersWithoutBaroniId = await User.find({ baroniId: { $exists: false } });
    console.log(`Found ${usersWithoutBaroniId.length} users without baroniId`);

    if (usersWithoutBaroniId.length === 0) {
      console.log('All users already have baroniIds');
      return;
    }

    // Generate and assign baroniIds
    for (const user of usersWithoutBaroniId) {
      try {
        const baroniId = await generateUniqueBaroniId();
        user.baroniId = baroniId;
        await user.save();
        console.log(`✓ Assigned baroniId ${baroniId} to user ${user._id} (${user.name || user.pseudo || 'Unknown'})`);
      } catch (error) {
        console.error(`✗ Failed to assign baroniId to user ${user._id}:`, error.message);
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error.message);
    console.error('Full error:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
    process.exit(0);
  }
}

// Run migration
migrateBaroniIds();
