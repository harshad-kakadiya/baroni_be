import { validationResult } from 'express-validator';
import LiveShow from '../models/LiveShow.js';
import LiveShowAttendance from '../models/LiveShowAttendance.js';
import User from '../models/User.js';
import { generateUniqueShowCode } from '../utils/liveShowCodeGenerator.js';
import { uploadFile } from '../utils/uploadFile.js';
import mongoose from 'mongoose';
import { createTransaction, completeTransaction, cancelTransaction } from '../services/transactionService.js';
import { TRANSACTION_TYPES, TRANSACTION_DESCRIPTIONS } from '../utils/transactionConstants.js';
import Transaction from '../models/Transaction.js';
import NotificationHelper from '../utils/notificationHelper.js';

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
  showCode: show.showCode,
  inviteLink: show.inviteLink,
  starId: show.starId ? {
    id: show.starId._id,
    baroniId: show.starId.baroniId,
    name: show.starId.name,
    pseudo: show.starId.pseudo,
    profilePic: show.starId.profilePic,
    availableForBookings: show.starId.availableForBookings,
    about: show.starId.about,
    location: show.starId.location,
    country: show.starId.country,
    preferredLanguage: show.starId.preferredLanguage,
    coinBalance: show.starId.coinBalance,
    profession: show.starId.profession ? {
      id: show.starId.profession._id,
      name: show.starId.profession.name,
      image: show.starId.profession.image
    } : null
  } : null,
  status: show.status,
  currentAttendees: show.currentAttendees,
  description: show.description,
  thumbnail: show.thumbnail,
  likeCount: Array.isArray(show.likes) ? show.likes.length : 0,
  isAtCapacity: show.isAtCapacity,
  isUpcoming: show.isUpcoming,
  createdAt: show.createdAt,
  updatedAt: show.updatedAt
});

const setPerUserFlags = (sanitized, show, req) => {
  const data = { ...sanitized };
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
  return data;
};

// Create a new live show (star)
export const createLiveShow = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { sessionTitle, date, time, attendanceFee, hostingPrice, maxCapacity, description, hostingPaymentMode = 'coin', hostingPaymentDescription } = req.body;

    // Hosting requires a transaction (escrow) to admin; external/coin allowed
    // Find admin receiver
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      return res.status(500).json({ success: false, message: 'Admin account not configured' });
    }

    // Create hosting transaction before creating show
    try {
      await createTransaction({
        type: TRANSACTION_TYPES.LIVE_SHOW_HOSTING_PAYMENT,
        payerId: req.user._id,
        receiverId: adminUser._id,
        amount: Number(hostingPrice || 0),
        description: hostingPaymentMode === 'external' && hostingPaymentDescription ? String(hostingPaymentDescription) : TRANSACTION_DESCRIPTIONS[TRANSACTION_TYPES.LIVE_SHOW_HOSTING_PAYMENT],
        paymentMode: hostingPaymentMode,
        metadata: {
          showType: 'live_show_hosting',
          requestedAt: new Date()
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
      status: 'pending'
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
      status: 'active', // Show is immediately active
      description,
      thumbnail: thumbnailUrl,
      transactionId: hostingTxn._id,
      hostingPaymentMode: hostingPaymentMode,
      hostingPaymentDescription: hostingPaymentMode === 'external' && hostingPaymentDescription ? String(hostingPaymentDescription) : undefined
    });

    await liveShow.populate('starId', 'name pseudo profilePic');

    // Send notification to star's followers
    try {
      await NotificationHelper.sendLiveShowNotification('LIVE_SHOW_CREATED', liveShow);
    } catch (notificationError) {
      console.error('Error sending live show notification:', notificationError);
    }

    return res.status(201).json({ success: true, message: 'Live show created successfully and is now open for joining', data: sanitizeLiveShow(liveShow) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get all live shows (public)
export const getAllLiveShows = async (req, res) => {
  try {
    const { status, starId, upcoming } = req.query;

    const allowedStatuses = ['active', 'cancelled'];
    const filter = {};
    if (status && allowedStatuses.includes(status)) filter.status = status;
    if (starId && mongoose.Types.ObjectId.isValid(starId)) filter.starId = starId;
    if (upcoming === 'true') {
      filter.date = { $gt: new Date() };
      filter.status = 'active';
    }

    const shows = await LiveShow.find(filter).populate('starId', 'name pseudo profilePic availableForBookings').sort({ date: 1 });

    const showsData = shows.map(show => setPerUserFlags(sanitizeLiveShow(show), show, req));

    return res.json({ success: true, data: showsData });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getLiveShowById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id).populate('starId', 'name pseudo profilePic availableForBookings');
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });

    const showData = setPerUserFlags(sanitizeLiveShow(show), show, req);

    return res.json({ success: true, data: showData });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getLiveShowByCode = async (req, res) => {
  try {
    const { showCode } = req.params;
    const show = await LiveShow.findOne({ showCode: showCode.toUpperCase() }).populate('starId', 'name pseudo profilePic availableForBookings');
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });

    const showData = setPerUserFlags(sanitizeLiveShow(show), show, req);

    return res.json({ success: true, data: showData });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateLiveShow = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

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
      .populate('starId', 'name pseudo profilePic availableForBookings');

    return res.json({ success: true, message: 'Live show updated successfully', data: sanitizeLiveShow(updatedShow) });
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

    return res.json({ success: true, message: 'Live show deleted successfully' });
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
    if (show.status !== 'active') return res.status(400).json({ success: false, message: 'Show is not open for joining' });

    // Check if already joined
    const alreadyJoined = Array.isArray(show.attendees) && show.attendees.some(u => u.toString() === req.user._id.toString());
    if (alreadyJoined) {
      const populated = await LiveShow.findById(id).populate('starId', 'name pseudo profilePic availableForBookings');
      const data = setPerUserFlags(sanitizeLiveShow(populated), populated, req);
      return res.json({ success: true, message: 'Already joined', data });
    }

    // Capacity check
    if (show.maxCapacity !== -1 && show.currentAttendees >= show.maxCapacity) {
      return res.status(400).json({ success: false, message: 'Show is at capacity' });
    }

    // Process attendance fee payment
    const amount = Number(show.attendanceFee || 0);
    const { paymentMode = 'coin', paymentDescription } = req.body || {};
    if (amount > 0) {
      try {
        await createTransaction({
          type: TRANSACTION_TYPES.LIVE_SHOW_ATTENDANCE_PAYMENT,
          payerId: req.user._id,
          receiverId: show.starId,
          amount,
          description: paymentMode === 'external' && paymentDescription ? String(paymentDescription) : TRANSACTION_DESCRIPTIONS[TRANSACTION_TYPES.LIVE_SHOW_ATTENDANCE_PAYMENT],
          paymentMode: paymentMode,
          metadata: {
            showId: show._id,
            showCode: show.showCode,
            showTitle: show.sessionTitle,
            showDate: show.date,
            showTime: show.time,
            showType: 'live_show_attendance'
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
      status: 'pending'
    }).sort({ createdAt: -1 });

    if (!transaction) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction'
      });
    }

    // Create attendance record
    await LiveShowAttendance.create({
      liveShowId: show._id,
      fanId: req.user._id,
      starId: show.starId,
      transactionId: transaction._id,
      attendanceFee: amount
    });

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
    
    // Send notification to star about new attendee
    try {
      await NotificationHelper.sendCustomNotification(
        show.starId,
        'New Live Show Attendee',
        `A fan has joined your live show "${show.sessionTitle}"`,
        {
          type: 'live_show_attendee',
          liveShowId: show._id.toString(),
          attendeeId: req.user._id.toString()
        }
      );
    } catch (notificationError) {
      console.error('Error sending attendee notification:', notificationError);
    }
    
    return res.json({ success: true, message: 'Joined live show successfully', data });
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
    return res.json({ success: true, data });
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
      status: 'active' 
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
      .populate('starId', 'name pseudo profilePic availableForBookings');

    // Send notification to attendees about cancellation
    try {
      await NotificationHelper.sendLiveShowNotification('LIVE_SHOW_CANCELLED', updated);
    } catch (notificationError) {
      console.error('Error sending live show cancellation notification:', notificationError);
    }

    return res.json({ success: true, message: 'Live show cancelled', data: sanitizeLiveShow(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Star reschedules a live show (change date/time)
export const rescheduleLiveShow = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

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
      .populate('starId', 'name pseudo profilePic availableForBookings');

    // Send notification to attendees about rescheduling
    try {
      await NotificationHelper.sendLiveShowNotification('LIVE_SHOW_RESCHEDULED', updated);
    } catch (notificationError) {
      console.error('Error sending live show reschedule notification:', notificationError);
    }

    return res.json({ success: true, message: 'Live show rescheduled', data: sanitizeLiveShow(updated) });
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
      status: 'active',
      date: { $gt: new Date() }
    })
    .sort({ date: 1 });

    const showsData = shows.map(show => setPerUserFlags(sanitizeLiveShow(show), show, req));

    return res.json({ success: true, data: showsData });
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
    const allowedStatuses = ['active', 'cancelled'];
    if (status && allowedStatuses.includes(status)) filter.status = status;

    const shows = await LiveShow.find(filter).sort({ date: -1 });

    const showsData = shows.map(show => setPerUserFlags(sanitizeLiveShow(show), show, req));

    return res.json({ success: true, data: showsData });
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
    return res.json({ success: true, message: hasLiked ? 'Unliked' : 'Liked', data });
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

    // Complete all active attendance transactions and transfer coins to star
    const attendances = await LiveShowAttendance.find({ 
      liveShowId: show._id, 
      status: 'active' 
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

    return res.json({ success: true, message: 'Live show attendance completed and coins transferred' });
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
      if (status && ['active', 'cancelled'].includes(status)) filter.status = status;
      if (upcoming === 'true') {
        filter.date = { $gt: new Date() };
        filter.status = 'active';
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
      if (status && ['active', 'cancelled'].includes(status)) filter.status = status;
      if (upcoming === 'true') {
        filter.date = { $gt: new Date() };
        filter.status = 'active';
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
