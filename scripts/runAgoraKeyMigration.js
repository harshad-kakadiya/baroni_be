#!/usr/bin/env node

/**
 * Manual migration script to add agoraKey to all existing users
 * Run this with: node scripts/runAgoraKeyMigration.js
 */

import { ensureAllUsersHaveAgoraKeys } from './ensureAllUsersHaveAgoraKeys.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const runMigration = async () => {
  try {
    console.log('🚀 Starting AgoraKey migration for existing users...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/baroni');
    console.log('✓ Connected to MongoDB\n');

    // Run the migration
    const result = await ensureAllUsersHaveAgoraKeys();
    
    console.log('\n=== Final Results ===');
    if (result.success) {
      console.log('🎉 Migration completed successfully!');
      if (result.processed > 0) {
        console.log(`📊 Statistics:`);
        console.log(`   - Users processed: ${result.processed}`);
        console.log(`   - Users updated: ${result.updated}`);
        console.log(`   - Errors: ${result.errors}`);
      } else {
        console.log('ℹ️  No users needed updating - all users already have agoraKey');
      }
    } else {
      console.log('❌ Migration failed!');
      console.log(`Error: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
    process.exit(0);
  }
};

// Run the migration
runMigration();
