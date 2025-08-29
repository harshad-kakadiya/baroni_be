import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import dotenv from 'dotenv';

dotenv.config();

const migrateTransactionStatus = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Update all existing transactions to have 'completed' status
    const result = await Transaction.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'completed' } }
    );

    console.log(`Updated ${result.modifiedCount} transactions with 'completed' status`);

    // Verify the update
    const totalTransactions = await Transaction.countDocuments();
    const completedTransactions = await Transaction.countDocuments({ status: 'completed' });
    const pendingTransactions = await Transaction.countDocuments({ status: 'pending' });

    console.log(`Total transactions: ${totalTransactions}`);
    console.log(`Completed transactions: ${completedTransactions}`);
    console.log(`Pending transactions: ${pendingTransactions}`);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateTransactionStatus();
}

export default migrateTransactionStatus;
