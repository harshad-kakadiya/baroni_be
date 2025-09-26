import {validationResult} from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import DedicationRequest from '../models/DedicationRequest.js';
import {generateUniqueTrackingId} from '../utils/trackingIdGenerator.js';
import {uploadVideo} from '../utils/uploadFile.js';
import { createTransaction, createHybridTransaction, completeTransaction, cancelTransaction } from '../services/transactionService.js';
import { TRANSACTION_TYPES, TRANSACTION_DESCRIPTIONS, createTransactionDescription } from '../utils/transactionConstants.js';
import Transaction from '../models/Transaction.js';
import NotificationHelper from '../utils/notificationHelper.js';
const { normalizeContact } = await import('../utils/normalizeContact.js');
import { deleteConversationBetweenUsers } from '../services/messagingCleanup.js';
import { sanitizeUserData } from '../utils/userDataHelper.js';

const sanitize = (doc) => ({
  id: doc._id,
  trackingId: doc.trackingId,
  fanId: doc.fanId && typeof doc.fanId === 'object' ? sanitizeUserData(doc.fanId) : doc.fanId,
  starId: doc.starId && typeof doc.starId === 'object' ? sanitizeUserData(doc.starId) : doc.starId,
  starBaroniId: doc.starId && doc.starId.baroniId ? doc.starId.baroniId : undefined,
  occasion: doc.occasion,
  eventName: doc.eventName,
  eventDate: doc.eventDate,
  description: doc.description,
  price: doc.price,
  status: doc.status,
  videoUrl: doc.videoUrl,
  transactionId: doc.transactionId,
  approvedAt: doc.approvedAt,
  rejectedAt: doc.rejectedAt,
  cancelledAt: doc.cancelledAt,
  completedAt: doc.completedAt,

  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt
});

// Fan creates a dedication requests
export const createDedicationRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    let { starId, starBaroniId, baroniId, occasion, eventName, eventDate, description, price, starName } = req.body;

    // Allow passing star by Baroni ID
    if (!starId && (starBaroniId || baroniId)) {
      const starByBaroni = await (await import('../models/User.js')).default.findOne({ baroniId: starBaroniId || baroniId, role: 'star' }).select('_id');
      if (!starByBaroni) return res.status(404).json({ success: false, message: 'Star not found' });
      starId = starByBaroni._id;
    }

    // Create hybrid transaction before creating dedication request
    let txnResult;
    try {
      const { contact: payloadContact } = req.body || {};
      const normalizedPhone = normalizeContact(payloadContact || '');
      if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: 'User phone number is required' });
      }
      txnResult = await createHybridTransaction({
        type: TRANSACTION_TYPES.DEDICATION_REQUEST_PAYMENT,
        payerId: req.user._id,
        receiverId: starId,
        amount: price,
        description: createTransactionDescription(TRANSACTION_TYPES.DEDICATION_REQUEST_PAYMENT, starName || ''),
        userPhone: payloadContact,
        starName: starName || '',
        metadata: {
          occasion,
          eventName,
          eventDate: new Date(eventDate),
          dedicationType: 'request'
        }
      });
    } catch (transactionError) {
      return res.status(400).json({
        success: false,
        message: 'Transaction failed: ' + transactionError.message
      });
    }

    // Get the created transaction ID
    const transaction = await Transaction.findOne({
      payerId: req.user._id,
      receiverId: starId,
      type: TRANSACTION_TYPES.DEDICATION_REQUEST_PAYMENT,
      status: { $in: ['pending', 'initiated'] }
    }).sort({ createdAt: -1 });

    if (!transaction) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction'
      });
    }

    const created = await DedicationRequest.create({
      trackingId: await generateUniqueTrackingId(),
      fanId: req.user._id,
      starId,
      occasion,
      eventName,
      eventDate: new Date(eventDate),
      description,
      price,
      status: 'pending',
      transactionId: transaction._id
    });

    // Notify star
    try {
      await NotificationHelper.sendDedicationNotification('DEDICATION_REQUEST_CREATED', created);
    } catch (notificationError) {
      console.error('Error sending dedication notification:', notificationError);
    }

    const responseBody = { success: true, data: sanitize(created) };
    if (txnResult && txnResult.paymentMode === 'hybrid' || txnResult?.externalAmount > 0) {
      if (txnResult.externalPaymentMessage) {
        responseBody.externalPaymentMessage = txnResult.externalPaymentMessage;
      }
    }

    return res.status(201).json(responseBody);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Unified listing of dedication requests based on user role
export const listDedicationRequests = async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};

    // Set filter based on user role
    if (req.user.role === 'fan') {
      filter.fanId = req.user._id;
    } else if (req.user.role === 'star') {
      filter.starId = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admin can see all requests - no filter applied
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Add status filter if provided
    if (status && ['pending', 'approved', 'cancelled', 'rejected', 'completed'].includes(status)) {
      filter.status = status;
    }

    const items = await DedicationRequest.find(filter)
      .populate('fanId', 'name pseudo profilePic agoraKey')
      .populate('starId', 'name pseudo profilePic agoraKey baroniId')
      .sort({ createdAt: -1 });

    const withComputed = items.map((doc) => {
      const base = sanitize(doc);
      const eventAt = base.eventDate ? new Date(base.eventDate) : undefined;
      const timeToNowMs = eventAt ? (eventAt.getTime() - Date.now()) : undefined;
      return { ...base, eventAt: eventAt ? eventAt.toISOString() : undefined, timeToNowMs };
    });

    const future = [];
    const past = [];
    for (const it of withComputed) {
      if (typeof it.timeToNowMs === 'number' && it.timeToNowMs >= 0) future.push(it); else past.push(it);
    }
    future.sort((a, b) => (a.timeToNowMs ?? Infinity) - (b.timeToNowMs ?? Infinity));
    past.sort((a, b) => Math.abs(a.timeToNowMs ?? 0) - Math.abs(b.timeToNowMs ?? 0));
    const data = [...future, ...past];

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get a specific dedication request
export const getDedicationRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const item = await DedicationRequest.findById(req.params.id)
      .populate('fanId', 'name pseudo profilePic agoraKey')
      .populate('starId', 'name pseudo profilePic agoraKey baroniId');

    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    // Check if user has access to this request
    if (req.user.role === 'admin') {
      // Admin can access any request
    } else if (item.fanId._id.toString() !== req.user._id.toString() &&
        item.starId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.json({ success: true, data: sanitize(item) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Star or admin approves a dedication request
export const approveDedicationRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    let filter = { _id: req.params.id, status: 'pending' };

    // If not admin, ensure user is the star
    if (req.user.role !== 'admin') {
      filter.starId = req.user._id;
    }

    const item = await DedicationRequest.findOne(filter);

    if (!item) return res.status(404).json({ success: false, message: 'Request not found or already processed' });

    item.status = 'approved';
    item.approvedAt = new Date();

    const updated = await item.save();

    // Send notification to fan about dedication request approval
    try {
      await NotificationHelper.sendDedicationNotification('DEDICATION_ACCEPTED', updated);
    } catch (notificationError) {
      console.error('Error sending dedication approval notification:', notificationError);
    }

    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Star rejects a dedication request
export const rejectDedicationRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    let filter = { _id: req.params.id, status: 'pending' };

    // If not admin, ensure user is the star
    if (req.user.role !== 'admin') {
      filter.starId = req.user._id;
    }

    const item = await DedicationRequest.findOne(filter);

    if (!item) return res.status(404).json({ success: false, message: 'Request not found or already processed' });

    item.status = 'rejected';
    item.rejectedAt = new Date();

    // Cancel and refund the pending transaction, if any
    if (item.transactionId) {
      try {
        await cancelTransaction(item.transactionId);
      } catch (transactionError) {
        console.error('Failed to cancel transaction for rejected dedication request:', transactionError);
        // Proceed with rejection even if refund fails; can be reconciled later
      }
    }

    const updated = await item.save();

    // Send notification to fan about dedication request rejection
    try {
      await NotificationHelper.sendDedicationNotification('DEDICATION_REJECTED', updated);
    } catch (notificationError) {
      console.error('Error sending dedication rejection notification:', notificationError);
    }

    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Star uploads the dedication video (keeps status approved, fan will complete)
export const uploadDedicationVideo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Video file is required' });
    }

    let filter = { _id: req.params.id, status: 'approved' };

    // If not admin, ensure user is the star
    if (req.user.role !== 'admin') {
      filter.starId = req.user._id;
    }

    const item = await DedicationRequest.findOne(filter);

    if (!item) return res.status(404).json({ success: false, message: 'Approved request not found' });

    // Upload video to storage
    item.videoUrl = await uploadVideo(req.file.buffer);
    const updated = await item.save();

    // Notify fan about video upload
    try {
      await NotificationHelper.sendDedicationNotification('DEDICATION_VIDEO_UPLOADED', updated);
    } catch (notificationError) {
      console.error('Error sending dedication video upload notification:', notificationError);
    }

    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Fan confirms completion (completes transaction and marks as completed)
export const completeDedicationByFan = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    let filter = { _id: req.params.id, status: 'approved' };

    // If not admin, ensure user is the fan
    if (req.user.role !== 'admin') {
      filter.fanId = req.user._id;
    }

    const item = await DedicationRequest.findOne(filter);
    if (!item) return res.status(404).json({ success: false, message: 'Approved request not found' });

    if (!item.videoUrl) {
      return res.status(400).json({ success: false, message: 'Video not uploaded yet' });
    }

    // Complete the transaction and transfer coins to star
    if (item.transactionId) {
      try {
        await completeTransaction(item.transactionId);
      } catch (transactionError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to complete transaction: ' + transactionError.message
        });
      }
    }

    item.status = 'completed';
    item.completedAt = new Date();
    const updated = await item.save();

    // Cleanup messages between fan and star after completion
    try {
      await deleteConversationBetweenUsers(item.fanId, item.starId);
    } catch (_e) {}

    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Fan cancels their own dedication request (only if pending)
export const cancelDedicationRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    let filter = { _id: req.params.id, status: 'pending' };

    // If not admin, ensure user is the fan
    if (req.user.role !== 'admin') {
      filter.fanId = req.user._id;
    }

    const item = await DedicationRequest.findOne(filter);

    if (!item) return res.status(404).json({ success: false, message: 'Request not found or cannot be cancelled' });

    // Cancel the transaction and refund coins if it's pending
    if (item.transactionId) {
      try {
        await cancelTransaction(item.transactionId);
      } catch (transactionError) {
        console.error('Failed to cancel transaction:', transactionError);
        // Continue with cancellation even if refund fails
      }
    }

    item.status = 'cancelled';
    item.cancelledAt = new Date();
    const updated = await item.save();
    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get dedication request by tracking ID (public endpoint)
export const getDedicationRequestByTrackingId = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { trackingId } = req.params;

    const item = await DedicationRequest.findOne({ trackingId })
      .populate('fanId', 'name pseudo profilePic agoraKey')
      .populate('starId', 'name pseudo profilePic agoraKey baroniId');

    if (!item) return res.status(404).json({ success: false, message: 'Request not found' });

    return res.json({ success: true, data: sanitize(item) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
