import { validationResult } from 'express-validator';
import LiveShow from '../models/LiveShow.js';
import User from '../models/User.js';
import { generateUniqueShowCode } from '../utils/liveShowCodeGenerator.js';
import { uploadFile } from '../utils/uploadFile.js';
import mongoose from 'mongoose';

const sanitizeLiveShow = (show) => ({
  id: show._id,
  sessionTitle: show.sessionTitle,
  date: show.date,
  time: show.time,
  attendanceFee: show.attendanceFee,
  hostingPrice: show.hostingPrice,
  maxCapacity: show.maxCapacity,
  showCode: show.showCode,
  inviteLink: show.inviteLink,
  starId: show.starId,
  status: show.status,
  currentAttendees: show.currentAttendees,
  description: show.description,
  thumbnail: show.thumbnail,
  isAtCapacity: show.isAtCapacity,
  isUpcoming: show.isUpcoming,
  createdAt: show.createdAt,
  updatedAt: show.updatedAt
});

// Create a new live show (star)
export const createLiveShow = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { sessionTitle, date, time, attendanceFee, hostingPrice, maxCapacity, description } = req.body;

    const showCode = await generateUniqueShowCode();
    const inviteLink = `${process.env.FRONTEND_URL || 'https://app.baroni.com'}/live/${showCode}`;

    let thumbnailUrl = undefined;
    if (req.file && req.file.buffer) {
      thumbnailUrl = await uploadFile(req.file.buffer);
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
      description,
      thumbnail: thumbnailUrl
    });

    await liveShow.populate('starId', 'name pseudo profilePic');

    return res.status(201).json({ success: true, message: 'Live show created successfully', data: sanitizeLiveShow(liveShow) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get all live shows (public)
export const getAllLiveShows = async (req, res) => {
  try {
    const { status, starId, upcoming } = req.query;

    const allowedStatuses = ['pending', 'scheduled', 'cancelled'];
    const filter = {};
    if (status && allowedStatuses.includes(status)) filter.status = status;
    if (starId && mongoose.Types.ObjectId.isValid(starId)) filter.starId = starId;
    if (upcoming === 'true') {
      filter.date = { $gt: new Date() };
      filter.status = 'scheduled';
    }

    const shows = await LiveShow.find(filter).populate('starId', 'name pseudo profilePic availableForBookings').sort({ date: 1 });

    const showsData = shows.map(show => {
      const sanitized = sanitizeLiveShow(show);
      if (req.user && req.user.role === 'fan') sanitized.isFavorite = req.user.favorites.includes(show.starId._id);
      return sanitized;
    });

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

    const showData = sanitizeLiveShow(show);
    if (req.user && req.user.role === 'fan') showData.isFavorite = req.user.favorites.includes(show.starId._id);

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

    const showData = sanitizeLiveShow(show);
    if (req.user && req.user.role === 'fan') showData.isFavorite = req.user.favorites.includes(show.starId._id);

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
export const scheduleLiveShow = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid live show ID' });

    const show = await LiveShow.findById(id);
    if (!show) return res.status(404).json({ success: false, message: 'Live show not found' });
    if (show.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending shows can be scheduled' });

    const updated = await LiveShow.findByIdAndUpdate(id, { status: 'scheduled' }, { new: true })
      .populate('starId', 'name pseudo profilePic availableForBookings');

    return res.json({ success: true, message: 'Live show scheduled', data: sanitizeLiveShow(updated) });
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

    const updated = await LiveShow.findByIdAndUpdate(id, { status: 'cancelled' }, { new: true })
      .populate('starId', 'name pseudo profilePic availableForBookings');

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
      status: 'scheduled',
      date: { $gt: new Date() }
    })
    .sort({ date: 1 });

    const showsData = shows.map(show => {
      const sanitized = sanitizeLiveShow(show);
      if (req.user && req.user.role === 'fan') sanitized.isFavorite = req.user.favorites.includes(starId);
      return sanitized;
    });

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
    const allowedStatuses = ['pending', 'scheduled', 'cancelled'];
    if (status && allowedStatuses.includes(status)) filter.status = status;

    const shows = await LiveShow.find(filter).sort({ date: -1 });

    const showsData = shows.map(show => {
      const sanitized = sanitizeLiveShow(show);
      if (req.user && req.user.role === 'fan') sanitized.isFavorite = req.user.favorites.includes(starId);
      return sanitized;
    });

    return res.json({ success: true, data: showsData });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
