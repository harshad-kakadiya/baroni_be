import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

/**
 * Create a transaction between users with pending status
 * @param {Object} transactionData - Transaction data
 * @param {string} transactionData.type - Transaction type
 * @param {string} transactionData.payerId - Payer user ID
 * @param {string} transactionData.receiverId - Receiver user ID
 * @param {number} transactionData.amount - Transaction amount
 * @param {string} transactionData.description - Transaction description
 * @param {string} transactionData.paymentMode - Payment mode ('coin' or 'external')
 * @param {Object} transactionData.metadata - Additional metadata
 * @returns {Promise<Object>} Created transaction
 */
export const createTransaction = async (transactionData) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const { type, payerId, receiverId, amount, description, paymentMode, metadata } = transactionData;

      // Validate amount
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // If payment mode is coin, check if payer has sufficient balance
      if (paymentMode === 'coin') {
        const payer = await User.findById(payerId).session(session);
        if (!payer) {
          throw new Error('Payer not found');
        }

        if (payer.coinBalance < amount) {
          throw new Error('Insufficient coin balance');
        }

        // Deduct coins from payer immediately (they are reserved)
        await User.findByIdAndUpdate(
          payerId,
          { $inc: { coinBalance: -amount } },
          { session, new: true }
        );
      }

      // Create transaction record with pending status
      await Transaction.create([{
        type,
        payerId,
        receiverId,
        amount,
        description,
        paymentMode,
        status: 'pending',
        metadata
      }], { session });
    });

    // If we reach here, transaction was successful
    return { success: true, message: 'Transaction created successfully with pending status' };

  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Complete a pending transaction and transfer coins to receiver
 * @param {string} transactionId - Transaction ID to complete
 * @returns {Promise<Object>} Updated transaction
 */
export const completeTransaction = async (transactionId) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'pending') {
        throw new Error('Transaction is not in pending status');
      }

      // Add coins to receiver regardless of payment mode. For 'external', coins are granted upon completion.
      await User.findByIdAndUpdate(
        transaction.receiverId,
        { $inc: { coinBalance: transaction.amount } },
        { session, new: true }
      );

      // Update transaction status to completed
      transaction.status = 'completed';
      await transaction.save({ session });
    });

    return { success: true, message: 'Transaction completed successfully' };

  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Cancel a pending transaction and refund coins to payer
 * @param {string} transactionId - Transaction ID to cancel
 * @returns {Promise<Object>} Updated transaction
 */
export const cancelTransaction = async (transactionId) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'pending') {
        throw new Error('Transaction is not in pending status');
      }

      // Refund coins to payer for both payment modes. For 'coin', this returns reserved coins.
      // For 'external', this credits coins to the user wallet instead of gateway refund.
      await User.findByIdAndUpdate(
        transaction.payerId,
        { $inc: { coinBalance: transaction.amount } },
        { session, new: true }
      );

      // Update transaction status to cancelled
      transaction.status = 'cancelled';
      await transaction.save({ session });
    });

    return { success: true, message: 'Transaction cancelled and coins refunded' };

  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Refund a completed transaction
 * @param {string} transactionId - Transaction ID to refund
 * @returns {Promise<Object>} Updated transaction
 */
export const refundTransaction = async (transactionId) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'completed') {
        throw new Error('Transaction is not in completed status');
      }

      // Reverse completion: deduct from receiver and credit payer, regardless of payment mode
      await User.findByIdAndUpdate(
        transaction.receiverId,
        { $inc: { coinBalance: -transaction.amount } },
        { session, new: true }
      );

      await User.findByIdAndUpdate(
        transaction.payerId,
        { $inc: { coinBalance: transaction.amount } },
        { session, new: true }
      );

      // Update transaction status to refunded
      transaction.status = 'refunded';
      await transaction.save({ session });
    });

    return { success: true, message: 'Transaction refunded successfully' };

  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Get user's transaction history
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @param {string} options.type - Filter by transaction type
 * @param {string} options.paymentMode - Filter by payment mode
 * @param {string} options.status - Filter by transaction status
 * @returns {Promise<Array>} Transaction history array
 */
export const getUserTransactionHistory = async (userId, options = {}) => {
  const { type, paymentMode, status } = options;

  const filter = {
    $or: [{ payerId: userId }, { receiverId: userId }]
  };

  if (type) filter.type = type;
  if (paymentMode) filter.paymentMode = paymentMode;
  if (status) filter.status = status;

  const transactions = await Transaction.find(filter)
    .populate('payerId', 'name email baroniId')
    .populate('receiverId', 'name email baroniId')
    .sort({ createdAt: -1 });

  return transactions;
};

/**
 * Get transaction by ID
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<Object>} Transaction details
 */
export const getTransactionById = async (transactionId) => {
  const transaction = await Transaction.findById(transactionId)
    .populate('payerId', 'name email baroniId')
    .populate('receiverId', 'name email baroniId');

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  return transaction;
};

/**
 * Get user's coin balance
 * @param {string} userId - User ID
 * @returns {Promise<number>} User's coin balance
 */
export const getUserCoinBalance = async (userId) => {
  const user = await User.findById(userId).select('coinBalance');
  if (!user) {
    throw new Error('User not found');
  }
  return user.coinBalance || 0;
};

/**
 * Initialize user with 1000 coins (for new registrations)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
export const initializeUserCoins = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { coinBalance: 1000 } },
    { new: true }
  );

  if (!user) {
    throw new Error('User not found');
  }
};
