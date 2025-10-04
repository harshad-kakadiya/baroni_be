import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import DedicationRequest from '../models/DedicationRequest.js';
import LiveShow from '../models/LiveShow.js';
import LiveShowAttendance from '../models/LiveShowAttendance.js';
import mongoose from 'mongoose';
import orangeMoneyService from './orangeMoneyService.js';
import { TRANSACTION_STATUSES } from '../utils/transactionConstants.js';

/**
 * Process payment callback from Orange Money
 * @param {Object} callbackData - Callback data from Orange Money
 * @returns {Promise<Object>} Processing result
 */
export const processPaymentCallback = async (callbackData) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Validate callback data
      const validatedData = orangeMoneyService.validateCallbackData(callbackData);
      const { transactionId, status, motif, amount } = validatedData;

      // Find transaction by external payment ID
      const transaction = await Transaction.findOne({ 
        externalPaymentId: transactionId 
      }).session(session);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (![TRANSACTION_STATUSES.INITIATED, TRANSACTION_STATUSES.PENDING].includes(transaction.status)) {
        throw new Error('Transaction is not in a processable status');
      }

      if (status === 'completed') {
        // Payment successful - move transaction to pending (escrow) and clear refund timer
        transaction.status = TRANSACTION_STATUSES.PENDING;
        transaction.refundTimer = null;
        await transaction.save({ session });

        // Reflect domain paymentStatus transitions to 'pending' once external payment succeeds
        await Appointment.updateMany(
          { transactionId: transaction._id },
          { $set: { paymentStatus: 'pending' } },
          { session }
        );
        await DedicationRequest.updateMany(
          { transactionId: transaction._id },
          { $set: { paymentStatus: 'pending' } },
          { session }
        );
        await LiveShow.updateMany(
          { transactionId: transaction._id },
          { $set: { paymentStatus: 'pending' } },
          { session }
        );
        await LiveShowAttendance.updateMany(
          { transactionId: transaction._id },
          { $set: { paymentStatus: 'pending' } },
          { session }
        );
      } else {
        // Payment failed - refund coins and mark as failed
        await refundHybridTransaction(transaction, session);
        await cancelLinkedEntitiesForTransaction(transaction, session);
      }
    });

    return { success: true, message: 'Payment callback processed successfully' };

  } catch (error) {
    console.error('Error processing payment callback:', error);
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Complete a hybrid transaction after successful external payment
 * @param {Object} transaction - Transaction object
 * @param {Object} session - MongoDB session
 */
const completeHybridTransaction = async (transaction, session) => {
  // Add external amount as coins to receiver
  if (transaction.externalAmount > 0) {
    await User.findByIdAndUpdate(
      transaction.receiverId,
      { $inc: { coinBalance: transaction.externalAmount } },
      { session, new: true }
    );
  }

  // Update transaction status
  transaction.status = TRANSACTION_STATUSES.COMPLETED;
  transaction.refundTimer = null; // Clear refund timer
  await transaction.save({ session });
};

/**
 * Refund a hybrid transaction after failed external payment
 * @param {Object} transaction - Transaction object
 * @param {Object} session - MongoDB session
 */
const refundHybridTransaction = async (transaction, session) => {
  // Refund coin amount to payer
  if (transaction.coinAmount > 0) {
    await User.findByIdAndUpdate(
      transaction.payerId,
      { $inc: { coinBalance: transaction.coinAmount } },
      { session, new: true }
    );
  }

  // Update transaction status
  transaction.status = TRANSACTION_STATUSES.FAILED;
  transaction.refundTimer = null; // Clear refund timer
  await transaction.save({ session });
};

// Cancel domain entities linked to a refunded/failed transaction
const cancelLinkedEntitiesForTransaction = async (transaction, session) => {
  // Cancel appointment linked to this transaction and free reserved slot
  const affectedAppointments = await Appointment.find({ transactionId: transaction._id, status: { $in: ['pending', 'approved'] } }).session(session);
  for (const appt of affectedAppointments) {
    appt.status = 'cancelled';
    appt.paymentStatus = 'refunded';
    await appt.save({ session });
    try {
      const Availability = (await import('../models/Availability.js')).default;
      await Availability.updateOne(
        { _id: appt.availabilityId, userId: appt.starId, 'timeSlots._id': appt.timeSlotId },
        { $set: { 'timeSlots.$.status': 'available' } }
      ).session(session);
    } catch (_e) {}
  }

  // Cancel dedication requests linked to this transaction
  await DedicationRequest.updateMany(
    { transactionId: transaction._id, status: { $in: ['pending', 'approved'] } },
    { $set: { status: 'cancelled', paymentStatus: 'refunded', cancelledAt: new Date() } },
    { session }
  );

  // Cancel live show created with a hosting payment that failed
  const hostingShow = await LiveShow.findOne({ transactionId: transaction._id }).session(session);
  if (hostingShow && hostingShow.status === 'pending') {
    hostingShow.status = 'cancelled';
    hostingShow.paymentStatus = 'refunded';
    await hostingShow.save({ session });
  }

  // Cancel live show attendance linked to this transaction and reverse attendee count
  const attendance = await LiveShowAttendance.findOne({ transactionId: transaction._id }).session(session);
  if (attendance && attendance.status === 'pending') {
    attendance.status = 'cancelled';
    attendance.cancelledAt = new Date();
    attendance.paymentStatus = 'refunded';
    await attendance.save({ session });

    await LiveShow.findByIdAndUpdate(
      attendance.liveShowId,
      {
        $pull: { attendees: attendance.fanId },
        $inc: { currentAttendees: -1 }
      },
      { session }
    );
  }
};

/**
 * Handle payment timeouts and refund coins
 * This function should be called by a cron job every few minutes
 * @returns {Promise<Object>} Processing result
 */
export const handlePaymentTimeout = async () => {
  const session = await mongoose.startSession();
  const timeoutMinutes = 15;
  const timeoutDate = new Date(Date.now() - (timeoutMinutes * 60 * 1000));
  let timeoutTransactions = [];

  try {
    await session.withTransaction(async () => {
      // Find transactions that are initiated and past timeout (external not confirmed in time)
      timeoutTransactions = await Transaction.find({
        status: TRANSACTION_STATUSES.INITIATED,
        refundTimer: { $lte: timeoutDate }
      }).session(session);

      for (const transaction of timeoutTransactions) {
        await refundHybridTransaction(transaction, session);
        await cancelLinkedEntitiesForTransaction(transaction, session);
        console.log(`Refunded transaction ${transaction._id} due to timeout`);
      }
    });

    return { 
      success: true, 
      message: `Processed ${timeoutTransactions.length} timeout transactions` 
    };

  } catch (error) {
    console.error('Error handling payment timeout:', error);
    throw error;
  } finally {
    await session.endSession();
  }
};
