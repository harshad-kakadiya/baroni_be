import { validationResult } from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import LiveShow from '../models/LiveShow.js';
import LiveShowAttendance from '../models/LiveShowAttendance.js';
import User from '../models/User.js';
import { generateUniqueShowCode } from '../utils/liveShowCodeGenerator.js';
import { uploadFile } from '../utils/uploadFile.js';
import mongoose from 'mongoose';
import { createTransaction, createHybridTransaction, completeTransaction, cancelTransaction } from '../services/transactionService.js';
import { TRANSACTION_TYPES, TRANSACTION_DESCRIPTIONS, createTransactionDescription } from '../utils/transactionConstants.js';
import Transaction from '../models/Transaction.js';
import NotificationHelper from '../utils/notificationHelper.js';
import { deleteConversationBetweenUsers } from '../services/messagingCleanup.js';
import { sanitizeUserData } from '../utils/userDataHelper.js';

// Get single live show details for fan
export const getLiveShowDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const fanId = req.user._id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Live show ID is required'
      });
    }

    const liveShow = await LiveShow.findById(id)
      .populate('starId', 'name pseudo profilePic baroniId role country about location profession coinBalance')
      .lean();

    if (!liveShow) {
      return res.status(404).json({
        success: false,
        message: 'Live show not found'
      });
    }

    // Check if live show is still live (not completed or cancelled)
    if (liveShow.status === 'completed' || liveShow.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This live show is no longer live'
      });
    }

    // Calculate time until live show
    const liveShowDateTime = new Date(liveShow.date);
    const now = new Date();
    const timeUntilLiveShow = liveShowDateTime.getTime() - now.getTime();

    // If live show time has passed, it's no longer live
    if (timeUntilLiveShow <= 0) {
      return res.status(400).json({
        success: false,
        message: 'This live show is no longer live'
      });
    }

    // Format time until live show
    const hours = Math.floor(timeUntilLiveShow / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntilLiveShow % (1000 * 60 * 60)) / (1000 * 60));
    const timeUntilLive = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} until live`;

    // Check if user has joined this live show
    const LiveShowAttendance = (await import('../models/LiveShowAttendance.js')).default;
    const userAttendance = await LiveShowAttendance.findOne({
      liveShowId: id,
      fanId: fanId
    }).lean();

    // Get star's profession details
    let professionDetails = null;
    if (liveShow.starId.profession) {
      const Category = (await import('../models/Category.js')).default;
      professionDetails = await Category.findById(liveShow.starId.profession).lean();
    }

    // Format date for display
    const showDate = new Date(liveShow.date);
    const formattedDate = showDate.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time for display
    const formattedTime = liveShow.time;

    const response = {
      success: true,
      data: {
        id: liveShow._id,
        sessionTitle: liveShow.sessionTitle,
        date: formattedDate,
        time: formattedTime,
        timeUntilLive,
        attendanceFee: liveShow.attendanceFee,
        maxCapacity: liveShow.maxCapacity,
        currentAttendees: liveShow.currentAttendees,
        showCode: liveShow.showCode,
        inviteLink: liveShow.inviteLink,
        status: liveShow.status,
        description: liveShow.description,
        thumbnail: liveShow.thumbnail,
        isJoined: !!userAttendance,
        attendanceStatus: userAttendance ? userAttendance.status : null,
        createdAt: liveShow.createdAt,
        updatedAt: liveShow.updatedAt,
        star: {
          id: liveShow.starId._id,
          name: liveShow.starId.name,
          pseudo: liveShow.starId.pseudo,
          profilePic: liveShow.starId.profilePic,
          baroniId: liveShow.starId.baroniId,
          role: liveShow.starId.role,
          country: liveShow.starId.country,
          about: liveShow.starId.about,
          location: liveShow.starId.location,
          coinBalance: liveShow.starId.coinBalance,
          profession: professionDetails ? {
            id: professionDetails._id,
            name: professionDetails.name,
            image: professionDetails.image
          } : null
        },
        attendance: {
          current: liveShow.currentAttendees,
          max: liveShow.maxCapacity === -1 ? 'Unlimited' : liveShow.maxCapacity,
          percentage: liveShow.maxCapacity === -1 ? 0 : Math.round((liveShow.currentAttendees / liveShow.maxCapacity) * 100)
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching live show details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching live show details'
    });
  }
};

const sanitizeLiveShow = (show) => ({
  id: show._id,
  sessionTitle: show.sessionTitle,
  date: show.date,
  time: show.time,
  attendanceFee: show.attendanceFee,
  hostingPrice: show.hostingPrice,
  transactionId: show.transactionId,
  hostingPaymentMode: show.hostingPaymentMode,
  hostingPaymentDescription: show.hostingPaymentDescription,
  maxCapacity: show.maxCapacity,
  thumbnail: show.thumbnail,
  showCode: show.showCode,
  inviteLink: show.inviteLink,
  starId: show.starId && typeof show.starId === 'object' ? sanitizeUserData(show.starId) : show.starId,
  attendees: Array.isArray(show.attendees) ? show.attendees.map((a) => a && typeof a === 'object' ? sanitizeUserData(a) : a) : show.attendees,
  likes: show.likes,
  likeCount: Array.isArray(show.likes) ? show.likes.length : 0,
  likesCount: Array.isArray(show.likes) ? show.likes.length : 0,
  status: show.status,
  ...(show.paymentStatus ? { paymentStatus: show.paymentStatus } : {}),
  createdAt: show.createdAt,
  updatedAt: show.updatedAt,
});

const setPerUserFlags = (sanitized, show, req) => {
  const data = { ...sanitized };
  // Ensure likeCount is always present across all responses
  data.likeCount = Array.isArray(show.likes) ? show.likes.length : 0;
  data.likesCount = data.likeCount;
  if (req.user && req.user.role === 'fan') {
    const starId = show.starId && show.starId._id ? show.starId._id : show.starId;
    data.isFavorite = Array.isArray(req.user.favorites) && starId
      ? req.user.favorites.map(String).includes(String(starId))
      : false;
    data.hasJoined = Array.isArray(show.attendees)
      ? show.attendees.map(String).includes(String(req.user._id))
      : false;
  } else {
    data.isFavorite = false;
    data.hasJoined = false;
  }
  data.isLiked = Array.isArray(show.likes) && req.user
    ? show.likes.some(u => u.toString() === req.user._id.toString())
    : false;
  // Derived flag: upcoming if scheduled in the future and still pending
  try {
    const now = new Date();
    const showDate = show && show.date ? new Date(show.date) : null;
    data.isUpcoming = !!(showDate && showDate.getTime() > now.getTime() && show.status === 'pending');
  } catch (_e) {
    data.isUpcoming = false;
  }
  return data;
};

// Create a new live show (star)
export const createLiveShow = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { sessionTitle, date, time, attendanceFee, hostingPrice, maxCapacity, description, starName } = req.body;

    // Hosting requires a transaction (escrow) to admin; hybrid payment
    // Find admin receiver
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      return res.status(500).json({ success: false, message: 'Admin account not configured' });
    }

    // Create hybrid hosting transaction before creating show
    let hostingTxnResult;
    try {
      const { contact: payloadContact } = req.body || {};
      const { normalizeContact } = await import('../utils/normalizeContact.js');
      const normalizedPhone = normalizeContact(payloadContact || '');
      if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: 'User phone number is required' });
      }
      hostingTxnResult = await createHybridTransaction({
        type: TRANSACTION_TYPES.LIVE_SHOW_HOSTING_PAYMENT,
        payerId: req.user._id,
        receiverId: adminUser._id,
        amount: Number(hostingPrice || 0),
        description: createTransactionDescription(TRANSACTION_TYPES.LIVE_SHOW_HOSTING_PAYMENT, req.user.name || req.user.pseudo || '', 'Admin', req.user.role || 'star', 'admin'),
        userPhone: normalizedPhone,
        starName: starName || '',
        metadata: {
          showType: 'live_show_hosting',
          requestedAt: new Date(),
          payerName: req.user.name || req.user.pseudo || ''
        }
      });
    } catch (transactionError) {
      return res.status(400).json({ success: false, message: 'Hosting payment failed: ' + transactionError.message });
    }

    // Retrieve the created hosting transaction
    const hostingTxn = await Transaction.findOne({
      payerId: req.user._id,
      receiverId: adminUser._id,
      type: TRANSACTION_TYPES.LIVE_SHOW_HOSTING_PAYMENT,
      status: { $in: ['pending', 'initiated'] }
    }).sort({ createdAt: -1 });
    if (!hostingTxn) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve hosting transaction' });
    }

    const showCode = await generateUniqueShowCode();
    const inviteLink = `${process.env.FRONTEND_URL || 'https://app.baroni.com'}/live/${showCode}`;

    let thumbnailUrl = undefined;
    if (req.body && typeof req.body.thumbnail === 'string' && req.body.thumbnail.trim()) {
      thumbnailUrl = req.body.thumbnail.trim();
    } else if (req.file && req.file.buffer) {
      thumbnailUrl = await uploadFile(req.file.buffer);
    }

    if (!thumbnailUrl) {
      return res.status(400).json({ success: false, message: 'Thumbnail is required to create a live show' });
    }

    const liveShow = await LiveShow.create({
      sessionTitle,
      date: new Date(date),
      time: String(time),
      attendanceFee: Number(attendanceFee),
      hostingPrice: Number(hostingPrice),
      maxCapacity: maxCapacity === 'unlimited' ? -1 : Number(maxCapacity),
      showCode,
      inviteLink,
      starId: req.user._id,
      status: 'pending',
      paymentStatus: hostingTxn.status === 'initiated' ? 'initiated' : 'pending',
      description,
      thumbnail: thumbnailUrl,
      transactionId: hostingTxn._id
    });

    await liveShow.populate('starId', 'name pseudo profilePic agoraKey');

    // Send notification to admin only (no followers notification)
    try {
      const starName = req.user.name || req.user.pseudo || 'A star';
      await NotificationHelper.sendCustomNotification(
        adminUser._id,
        'New Live Show Created',
        `${starName} has created a new live show: "${sessionTitle}"`,
        {
          type: 'live_show',
          liveShowId: liveShow._id.toString(),
          starId: req.user._id.toString(),
          starName: starName,
          navigateTo: 'live_show',
          eventType: 'LIVE_SHOW_CREATED'
        }
      );
    } catch (notificationError) {
      console.error('Error sending live show notification to admin:', notificationError);
    }

    const resp = { 
      success: true, 
      message: 'Live show created successfully and is now open for joining',
      data: {
        liveShow: sanitizeLiveShow(liveShow),
        count: 1
      }
    };
    if (hostingTxnResult && hostingTxnResult.paymentMode === 'hybrid' || hostingTxnResult?.externalAmount > 0) {
      if (hostingTxnResult.externalPaymentMessage) resp.data.externalPaymentMessage = hostingTxnResult.externalPaymentMessage;
    }
    return res.status(201).json(resp);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get all live shows (public)
export const getAllLiveShows = async (req, res) => {
  try {
    const { status, starId, upcoming } = req.query;

    const allowedStatuses = ['pending', 'completed', 'cancelled'];
    const filter = {};
    if (status && allowedStatuses.includes(status)) filter.status = status;
    if (starId && mongoose.Types.ObjectId.isValid(starId)) filter.starId = starId;
    if (upcoming === 'true') {
      filter.date = { $gt: new Date() };
      filter.status = 'pending';
    }

    const shows = await LiveShow.find(filter).populate('starId', 'name pseudo profilePic availableForBookings agoraKey').sort({ date: 1 });

    const withComputed = shows.map((show) => {
      const sanitized = sanitizeLiveShow(show);
      const dateObj = sanitized.date ? new Date(sanitized.date) : undefined;
      const timeToNowMs = dateObj ? (dateObj.getTime() - Date.now()) : undefined;
      const flagged = setPerUserFlags(sanitized, show, req);
      const likescount = Array.isArray(show.likes) ? show.likes.length : 0;
      const { likes, likeCount, likesCount, ...rest } = flagged;
      return { ...rest, likescount, showAt: dateObj ? dateObj.toISOString() : undefined, timeToNowMs };
    });

    const future = [];
    const past = [];
    const cancelled = [];
    for (const it of withComputed) {
      if (it.status === 'cancelled') {
        cancelled.push(it);
      } else if (typeof it.timeToNowMs === 'number' && it.timeToNowMs >= 0) {
        future.push(it);
      } else {
        past.push(it);
      }
    }
    future.sort((a, b) => (a.timeToNowMs ?? Infinity) - (b.timeToNowMs ?? Infinity));
    past.sort((a, b) => Math.abs(a.timeToNowMs ?? 0) - Math.abs(b.timeToNowMs ?? 0));
    cancelled.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const data = [...future, ...past, ...cancelled];

    return res.json({ 
      success: true, 
      message: 'Live shows retrieved successfully',
      data: data
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getLiveShowById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id).populate('starId', 'name pseudo profilePic availableForBookings agoraKey');
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });

    const showData = setPerUserFlags(sanitizeLiveShow(show), show, req);

    return res.json({ 
      success: true, 
      message: 'Live show retrieved successfully',
      data: {
        liveShow: showData
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getLiveShowByCode = async (req, res) => {
  try {
    const { showCode } = req.params;
    const show = await LiveShow.findOne({ showCode: showCode.toUpperCase() }).populate('starId', 'name pseudo profilePic availableForBookings agoraKey');
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });

    const showData = setPerUserFlags(sanitizeLiveShow(show), show, req);

    return res.json({ 
      success: true, 
      message: 'Live show retrieved successfully',
      data: {
        liveShow: showData
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateLiveShow = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { id } = req.params;
    const updateData = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id);
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });

    if (show.starId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You can only update your own live shows' });
    }

    if (updateData.maxCapacity === 'unlimited') updateData.maxCapacity = -1;

    if (req.file && req.file.buffer) updateData.thumbnail = await uploadFile(req.file.buffer);

    const updatedShow = await LiveShow.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
      .populate('starId', 'name pseudo profilePic availableForBookings agoraKey');

    return res.json({ 
      success: true, 
      message: 'Live show updated successfully',
      data: {
        liveShow: sanitizeLiveShow(updatedShow)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteLiveShow = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id);
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });

    if (show.starId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You can only delete your own live shows' });
    }

    await LiveShow.findByIdAndDelete(id);

    return res.json({ 
      success: true, 
      message: 'Live show deleted successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Fan schedules a show (books) -> move from pending to scheduled
// Fan joins a live show after successful attendance payment
export const joinLiveShow = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id);
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });
    if (show.status !== 'pending') return res.status(400).json({ success: false, message: 'Show is not open for joining' });

    // Check if already joined
    const alreadyJoined = Array.isArray(show.attendees) && show.attendees.some(u => u.toString() === req.user._id.toString());
    if (alreadyJoined) {
      const populated = await LiveShow.findById(id).populate('starId', 'name pseudo profilePic availableForBookings');
      const data = setPerUserFlags(sanitizeLiveShow(populated), populated, req);
      return res.json({ 
        success: true, 
        message: 'Already joined',
        data: {
          ...data
        }
      });
    }

    // Capacity check
    if (show.maxCapacity !== -1 && show.currentAttendees >= show.maxCapacity) {
      return res.status(400).json({ success: false, message: 'Show is at capacity' });
    }

    // Process attendance fee payment
    const amount = Number(show.attendanceFee || 0);
    const { starName } = req.body || {};

    let attendanceTxnResult;
    if (amount > 0) {
      try {
        const { contact: payloadContact } = req.body || {};
        const { normalizeContact } = await import('../utils/normalizeContact.js');
        const normalizedPhone = normalizeContact(payloadContact || '');
        if (!normalizedPhone) {
          return res.status(400).json({ success: false, message: 'User phone number is required' });
        }
        attendanceTxnResult = await createHybridTransaction({
          type: TRANSACTION_TYPES.LIVE_SHOW_ATTENDANCE_PAYMENT,
          payerId: req.user._id,
          receiverId: show.starId,
          amount,
          description: createTransactionDescription(TRANSACTION_TYPES.LIVE_SHOW_ATTENDANCE_PAYMENT, req.user.name || req.user.pseudo || '', starName || '', req.user.role || 'fan', 'star'),
          userPhone: normalizedPhone,
          starName: starName || '',
          metadata: {
            showId: show._id,
            showCode: show.showCode,
            showTitle: show.sessionTitle,
            showDate: show.date,
            showTime: show.time,
            showType: 'live_show_attendance',
            payerName: req.user.name || req.user.pseudo || ''
          }
        });
      } catch (transactionError) {
        return res.status(400).json({ success: false, message: 'Attendance payment failed: ' + transactionError.message });
      }
    }

    // Get the created transaction ID
    const transaction = await Transaction.findOne({
      payerId: req.user._id,
      receiverId: show.starId,
      type: TRANSACTION_TYPES.LIVE_SHOW_ATTENDANCE_PAYMENT,
      status: { $in: ['pending', 'initiated'] }
    }).sort({ createdAt: -1 });

    if (!transaction) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction'
      });
    }

    // Check if attendance record already exists (from previous failed attempt)
    let attendance = await LiveShowAttendance.findOne({
      liveShowId: show._id,
      fanId: req.user._id
    });

    if (attendance) {
      // Update existing attendance record with new transaction
      attendance.transactionId = transaction._id;
      attendance.attendanceFee = amount;
      attendance.status = 'pending';
      attendance.paymentStatus = transaction.status === 'initiated' ? 'initiated' : 'pending';
      attendance.joinedAt = new Date();
      attendance.cancelledAt = undefined;
      attendance.refundedAt = undefined;
      await attendance.save();
    } else {
      // Create new attendance record
      attendance = await LiveShowAttendance.create({
        liveShowId: show._id,
        fanId: req.user._id,
        starId: show.starId,
        transactionId: transaction._id,
        attendanceFee: amount,
        paymentStatus: transaction.status === 'initiated' ? 'initiated' : 'pending'
      });
    }

    // Mark as joined
    const updated = await LiveShow.findByIdAndUpdate(
      id,
      {
        $addToSet: { attendees: req.user._id },
        $inc: { currentAttendees: 1 }
      },
      { new: true }
    ).populate('starId', 'name pseudo profilePic availableForBookings');

    const data = setPerUserFlags(sanitizeLiveShow(updated), updated, req);

    // Send notification to star about new attendee (general notification, not VoIP)
    try {
      await NotificationHelper.sendCustomNotification(
        show.starId,
        'New Live Show Attendee',
        `A fan has joined your live show "${show.sessionTitle}"`,
        {
          type: 'live_show_attendee',
          liveShowId: show._id.toString(),
          attendeeId: req.user._id.toString(),
          navigateTo: 'live_show',
          eventType: 'LIVE_SHOW_ATTENDEE_JOINED'
        }
      );
    } catch (notificationError) {
      console.error('Error sending attendee notification:', notificationError);
    }

    const joinResp = { success: true, message: 'Joined live show successfully', data };
    if (attendanceTxnResult && attendanceTxnResult.paymentMode === 'hybrid' || attendanceTxnResult?.externalAmount > 0) {
      if (attendanceTxnResult.externalPaymentMessage) joinResp.externalPaymentMessage = attendanceTxnResult.externalPaymentMessage;
    }
    return res.json(joinResp);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get current user's joined live shows
export const getMyJoinedLiveShows = async (req, res) => {
  try {
    const shows = await LiveShow.find({ attendees: req.user._id })
      .populate('starId', 'name pseudo profilePic availableForBookings')
      .sort({ date: -1 });

    const data = shows.map(show => setPerUserFlags(sanitizeLiveShow(show), show, req));
    return res.json({ 
      success: true, 
      message: 'Live shows retrieved successfully',
      data: data
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Star cancels a live show
export const cancelLiveShow = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id);
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });
    if (show.starId.toString() !== req.user._id.toString() && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the star can cancel this show' });

    // Cancel all pending attendance transactions and refund coins
    const attendances = await LiveShowAttendance.find({
      liveShowId: show._id,
      status: 'pending'
    });

    for (const attendance of attendances) {
      try {
        await cancelTransaction(attendance.transactionId);
        attendance.status = 'cancelled';
        attendance.cancelledAt = new Date();
        await attendance.save();
      } catch (transactionError) {
        console.error('Failed to cancel attendance transaction:', transactionError);
        // Continue with other cancellations even if one fails
      }
    }

    const updated = await LiveShow.findByIdAndUpdate(id, { status: 'cancelled' }, { new: true })
      .populate('starId', 'name pseudo profilePic availableForBookings agoraKey');

    // Send notification to attendees about cancellation
    try {
      await NotificationHelper.sendLiveShowNotification('LIVE_SHOW_CANCELLED', updated);
    } catch (notificationError) {
      console.error('Error sending live show cancellation notification:', notificationError);
    }

    return res.json({ 
      success: true, 
      message: 'Live show cancelled',
      data: {
        liveShow: sanitizeLiveShow(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Star reschedules a live show (change date/time)
export const rescheduleLiveShow = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { id } = req.params;
    const { date, time } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id);
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });
    if (show.starId.toString() !== req.user._id.toString() && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the star can reschedule this show' });

    const payload = {};
    if (date) payload.date = new Date(date);
    if (time) payload.time = String(time);

    const updated = await LiveShow.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate('starId', 'name pseudo profilePic availableForBookings agoraKey');

    // Send notification to attendees about rescheduling
    try {
      await NotificationHelper.sendLiveShowNotification('LIVE_SHOW_RESCHEDULED', updated);
    } catch (notificationError) {
      console.error('Error sending live show reschedule notification:', notificationError);
    }

    return res.json({ 
      success: true, 
      message: 'Live show rescheduled',
      data: {
        liveShow: sanitizeLiveShow(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get upcoming shows for a specific star (public)
export const getStarUpcomingShows = async (req, res) => {
  try {
    const { starId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(starId)) return res.status(400).json({ success: false, message: 'Invalid star ID' });

    const shows = await LiveShow.find({
      starId,
      status: 'pending',
      date: { $gt: new Date() }
    })
    .sort({ date: 1 });

    const showsData = shows.map(show => setPerUserFlags(sanitizeLiveShow(show), show, req));

    return res.json({ 
      success: true, 
      message: 'Live shows retrieved successfully',
      data: {
        liveShows: showsData
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get all shows for a specific star (public)
export const getStarAllShows = async (req, res) => {
  try {
    const { starId } = req.params;
    const { status } = req.query;
    if (!mongoose.Types.ObjectId.isValid(starId)) return res.status(400).json({ success: false, message: 'Invalid star ID' });

    const filter = { starId };
    const allowedStatuses = ['pending', 'completed', 'cancelled'];
    if (status && allowedStatuses.includes(status)) filter.status = status;

    const shows = await LiveShow.find(filter).sort({ date: -1 });

    const showsData = shows.map(show => setPerUserFlags(sanitizeLiveShow(show), show, req));

    return res.json({ 
      success: true, 
      message: 'Live shows retrieved successfully',
      data: {
        liveShows: showsData
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Fan like/unlike a live show
export const toggleLikeLiveShow = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });
    const show = await LiveShow.findById(id);
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });

    const userIdStr = req.user._id.toString();
    const hasLiked = Array.isArray(show.likes) && show.likes.some(u => u.toString() === userIdStr);
    const update = hasLiked
      ? { $pull: { likes: req.user._id } }
      : { $addToSet: { likes: req.user._id } };

    const updated = await LiveShow.findByIdAndUpdate(id, update, { new: true });
    const data = sanitizeLiveShow(updated);
    data.isLiked = !hasLiked;
    return res.json({ 
      success: true, 
      message: hasLiked ? 'Unliked' : 'Liked',
      data: {
        ...data,
        likeCount: Array.isArray(updated.likes) ? updated.likes.length : 0
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Complete live show attendance and transfer coins to star
export const completeLiveShowAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id);
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });
    if (show.starId.toString() !== req.user._id.toString() && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the star can complete this show' });

    // Complete all pending attendance transactions and transfer coins to star
    const attendances = await LiveShowAttendance.find({
      liveShowId: show._id,
      status: 'pending'
    });

    for (const attendance of attendances) {
      try {
        await completeTransaction(attendance.transactionId);
        attendance.status = 'completed';
        await attendance.save();
      } catch (transactionError) {
        console.error('Failed to complete attendance transaction:', transactionError);
        // Continue with other completions even if one fails
      }
    }

    // Mark show as completed
    await LiveShow.findByIdAndUpdate(id, { status: 'completed' });

    // Cleanup messages between star and each attendee
    try {
      const completedAttendances = await LiveShowAttendance.find({ liveShowId: show._id, status: 'completed' }).select('fanId starId');
      for (const a of completedAttendances) {
        await deleteConversationBetweenUsers(a.fanId, a.starId);
      }
    } catch (_e) {}

    return res.json({ 
      success: true, 
      message: 'Live show attendance completed and coins transferred'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get my shows based on user role (joined shows for fans, hosted shows for stars)
export const getMyShows = async (req, res) => {
  try {
    const { status, upcoming } = req.query;
    let shows = [];

    if (req.user.role === 'fan') {
      // For fans: get shows they have joined
      const filter = { attendees: req.user._id };
      if (status && ['pending', 'completed', 'cancelled'].includes(status)) filter.status = status;
      if (upcoming === 'true') {
        filter.date = { $gt: new Date() };
        filter.status = 'pending';
      }

      shows = await LiveShow.find(filter)
        .populate({
          path: 'starId',
          select: 'baroniId name pseudo profilePic availableForBookings about location country preferredLanguage coinBalance',
          populate: {
            path: 'profession',
            select: 'name image'
          }
        })
        .sort({ date: -1 });
    } else if (req.user.role === 'star') {
      // For stars: get shows they have hosted
      const filter = { starId: req.user._id };
      if (status && ['pending', 'completed', 'cancelled'].includes(status)) filter.status = status;
      if (upcoming === 'true') {
        filter.date = { $gt: new Date() };
        filter.status = 'pending';
      }

      shows = await LiveShow.find(filter)
        .populate({
          path: 'starId',
          select: 'baroniId name pseudo profilePic availableForBookings about location country preferredLanguage coinBalance',
          populate: {
            path: 'profession',
            select: 'name image'
          }
        })
        .sort({ date: -1 });
    } else {
      return res.status(403).json({ success: false, message: 'Access denied. Only fans and stars can access this endpoint.' });
    }

    const showsData = shows.map(show => setPerUserFlags(sanitizeLiveShow(show), show, req));

    return res.json({
      success: true,
      data: showsData,
      role: req.user.role,
      count: showsData.length
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
