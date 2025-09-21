import mongoose from 'mongoose';
import User from '../models/User.js';
import { generateUniqueAgoraKey } from '../utils/agoraKeyGenerator.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Ensures all users have an agoraKey
 * This function can be called during application startup or as a standalone migration
 */
export const ensureAllUsersHaveAgoraKeys = async () => {
  try {
    console.log('Checking for users without agoraKey...');
    
    // Find all users without agoraKey
    const usersWithoutAgoraKey = await User.find({ 
      $or: [
        { agoraKey: { $exists: false } },
        { agoraKey: null },
        { agoraKey: '' }
      ]
    });

    if (usersWithoutAgoraKey.length === 0) {
      console.log('✓ All users already have agoraKey');
      return { success: true, processed: 0, errors: 0 };
    }

    console.log(`Found ${usersWithoutAgoraKey.length} users without agoraKey. Processing...`);

    let successCount = 0;
    let errorCount = 0;

    // Process users one by one to ensure uniqueness
    for (const user of usersWithoutAgoraKey) {
      try {
        // Generate unique agoraKey for this user
        const agoraKey = await generateUniqueAgoraKey();
        
        // Update the user with the new agoraKey
        await User.findByIdAndUpdate(user._id, { agoraKey });
        
        console.log(`✓ Updated user ${user._id} with agoraKey: ${agoraKey}`);
        successCount++;
      } catch (error) {
        console.error(`✗ Error updating user ${user._id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n=== AgoraKey Migration Summary ===`);
    console.log(`Total users processed: ${usersWithoutAgoraKey.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

    return { 
      success: errorCount === 0, 
      processed: usersWithoutAgoraKey.length, 
      updated: successCount, 
      errors: errorCount 
    };

  } catch (error) {
    console.error('Error ensuring all users have agoraKey:', error);
    return { success: false, error: error.message };
  }
};

// If this script is run directly, execute the migration
if (import.meta.url === `file://${process.argv[1]}`) {
  const runMigration = async () => {
    try {
      // Connect to MongoDB
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/baroni');
      console.log('Connected to MongoDB');

      const result = await ensureAllUsersHaveAgoraKeys();
      
      if (result.success) {
        console.log('🎉 Migration completed successfully!');
      } else {
        console.log('⚠️  Migration completed with errors');
      }

    } catch (error) {
      console.error('Migration failed:', error);
    } finally {
      // Close database connection
      await mongoose.connection.close();
      console.log('Database connection closed');
      process.exit(0);
    }
  };

  runMigration();
}
