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

    // Find STAR users without baroniId
    const usersWithoutBaroniId = await User.find({ role: 'star', $or: [ { baroniId: { $exists: false } }, { baroniId: null } ] });
    console.log(`Found ${usersWithoutBaroniId.length} users without baroniId`);

    if (usersWithoutBaroniId.length === 0) {
      console.log('All users already have baroniIds');
      return;
    }

    // Generate and assign baroniIds to stars only (5-digit system)
    for (const user of usersWithoutBaroniId) {
      try {
        // Assign standard 5-digit Baroni ID for existing stars
        const baroniId = await generateUniqueBaroniId();
        user.baroniId = baroniId;
        await user.save();
        console.log(`✓ Assigned 5-digit baroniId ${baroniId} to user ${user._id} (${user.name || user.pseudo || 'Unknown'})`);
      } catch (error) {
        console.error(`✗ Failed to assign baroniId to user ${user._id}:`, error.message);
      }
    }

    // Optional cleanup: ensure fans/admins do not have baroniId
    const nonStarsWithBaroni = await User.find({ role: { $in: ['fan', 'admin'] }, baroniId: { $exists: true, $ne: null } });
    for (const user of nonStarsWithBaroni) {
      try {
        user.baroniId = undefined;
        await user.save();
        console.log(`✓ Removed baroniId from non-star user ${user._id}`);
      } catch (error) {
        console.error(`✗ Failed to remove baroniId from non-star user ${user._id}:`, error.message);
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
