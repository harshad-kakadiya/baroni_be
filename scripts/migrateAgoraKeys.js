import mongoose from 'mongoose';
import User from '../models/User.js';
import { generateUniqueAgoraKey } from '../utils/agoraKeyGenerator.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const migrateAgoraKeys = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/baroni');
    console.log('Connected to MongoDB');

    // Find all users without agoraKey
    const usersWithoutAgoraKey = await User.find({ 
      $or: [
        { agoraKey: { $exists: false } },
        { agoraKey: null },
        { agoraKey: '' }
      ]
    });

    console.log(`Found ${usersWithoutAgoraKey.length} users without agoraKey`);

    if (usersWithoutAgoraKey.length === 0) {
      console.log('All users already have agoraKey. Migration not needed.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Process users in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < usersWithoutAgoraKey.length; i += batchSize) {
      const batch = usersWithoutAgoraKey.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(usersWithoutAgoraKey.length / batchSize)}`);
      
      // Process each user in the batch
      for (const user of batch) {
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
      
      // Small delay between batches to be gentle on the database
      if (i + batchSize < usersWithoutAgoraKey.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total users processed: ${usersWithoutAgoraKey.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log('🎉 Migration completed successfully!');
    } else {
      console.log('⚠️  Migration completed with some errors. Please check the logs above.');
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

// Run the migration
migrateAgoraKeys();
