import {validationResult} from 'express-validator';
import DedicationRequest from '../models/DedicationRequest.js';
import {generateUniqueTrackingId} from '../utils/trackingIdGenerator.js';
import {uploadVideo} from '../utils/uploadFile.js';
import { createTransaction, completeTransaction, cancelTransaction } from '../services/transactionService.js';
import { TRANSACTION_TYPES, TRANSACTION_DESCRIPTIONS } from '../utils/transactionConstants.js';
import Transaction from '../models/Transaction.js';
import NotificationHelper from '../utils/notificationHelper.js';

const sanitize = (doc) => ({
  id: doc._id,
  trackingId: doc.trackingId,
  fanId: doc.fanId,
  starId: doc.starId,
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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { starId, occasion, eventName, eventDate, description, price, paymentMode = 'coin', paymentDescription } = req.body;

    // Create transaction before creating dedication request
    try {
      await createTransaction({
        type: TRANSACTION_TYPES.DEDICATION_REQUEST_PAYMENT,
        payerId: req.user._id,
        receiverId: starId,
        amount: price,
        description: paymentMode === 'external' && paymentDescription ? String(paymentDescription) : TRANSACTION_DESCRIPTIONS[TRANSACTION_TYPES.DEDICATION_REQUEST_PAYMENT],
        paymentMode: paymentMode,
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
      status: 'pending'
    }).sort({ createdAt: -1 });

    if (!transaction) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction'
      });
    }

    // Generate unique tracking ID
    const trackingId = await generateUniqueTrackingId();

    const created = await DedicationRequest.create({
      trackingId,
      fanId: req.user._id,
      starId,
      occasion: occasion.trim(),
      eventName: eventName.trim(),
      eventDate: new Date(eventDate),
      description: description.trim(),
      price,
      transactionId: transaction._id,
    });

    // Send notification to star about new dedication request
    try {
      await NotificationHelper.sendDedicationNotification('DEDICATION_REQUEST', created);
    } catch (notificationError) {
      console.error('Error sending dedication request notification:', notificationError);
    }

    return res.status(201).json({ success: true, data: sanitize(created) });
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
      .populate('fanId')
      .populate('starId')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: items.map(sanitize) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get a specific dedication request
export const getDedicationRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const item = await DedicationRequest.findById(req.params.id)
      .populate('fanId')
      .populate('starId');

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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

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

// Star uploads video for approved dedication request
export const uploadDedicationVideo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Video file is required' });

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

    // Upload video to cloudinary
    item.videoUrl = await uploadVideo(req.file.buffer);
    item.status = 'completed';
    item.completedAt = new Date();
    const updated = await item.save();

    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Fan cancels their own dedication request (only if pending)
export const cancelDedicationRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

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
        // Continue with request cancellation even if transaction cancellation fails
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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { trackingId } = req.params;

    const item = await DedicationRequest.findOne({ trackingId })
      .populate('fanId')
      .populate('starId');

    if (!item) return res.status(404).json({ success: false, message: 'Request not found' });

    return res.json({ success: true, data: sanitize(item) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
