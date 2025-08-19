import { validationResult } from 'express-validator';
import Availability from '../models/Availability.js';
import Appointment from '../models/Appointment.js';

const toUser = (u) => (
  u && u._id ? {
    id: u._id,
    name: u.name,
    pseudo: u.pseudo,
    profilePic: u.profilePic,
    email: u.email,
    contact: u.contact,
    role: u.role,
  } : u
);

const toAvailability = (a) => (
  a && a._id ? {
    id: a._id,
    date: a.date,
    timeSlots: Array.isArray(a.timeSlots) ? a.timeSlots.map((t) => ({ id: t._id, slot: t.slot, status: t.status })) : [],
  } : a
);

const sanitize = (doc) => ({
  id: doc._id,
  star: toUser(doc.starId),
  fan: toUser(doc.fanId),
  availability: toAvailability(doc.availabilityId),
  timeSlotId: doc.timeSlotId,
  date: doc.date,
  time: doc.time,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export const createAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { starId, availabilityId, timeSlotId } = req.body;

    const availability = await Availability.findOne({ _id: availabilityId, userId: starId });
    if (!availability) return res.status(404).json({ success: false, message: 'Availability not found' });

    const slot = availability.timeSlots.find((s) => String(s._id) === String(timeSlotId));
    if (!slot) return res.status(404).json({ success: false, message: 'Time slot not found' });
    if (slot.status === 'unavailable') return res.status(409).json({ success: false, message: 'Time slot unavailable' });

    const created = await Appointment.create({
      starId,
      fanId: req.user._id,
      availabilityId,
      timeSlotId,
      date: availability.date,
      time: slot.slot,
      status: 'pending',
    });
    return res.status(201).json({ success: true, data: sanitize(created) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listAppointments = async (req, res) => {
  try {
    const isStar = req.user.role === 'star' || req.user.role === 'admin';
    const filter = isStar ? { starId: req.user._id } : { fanId: req.user._id };
    const items = await Appointment.find(filter)
      .populate('starId', 'name pseudo profilePic email contact role')
      .populate('fanId', 'name pseudo profilePic email contact role')
      .populate('availabilityId')
      .sort({ createdAt: -1 });

    const data = items.map((doc) => {
      const base = sanitize(doc);
      let timeSlotObj = undefined;
      if (doc.availabilityId && doc.availabilityId.timeSlots) {
        const found = doc.availabilityId.timeSlots.find((s) => String(s._id) === String(doc.timeSlotId));
        if (found) timeSlotObj = { id: found._id, slot: found.slot, status: found.status };
      }
      return { ...base, timeSlot: timeSlotObj };
    });
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const approveAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { id } = req.params;
    const appt = await Appointment.findOne({ _id: id, starId: req.user._id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (appt.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending can be approved' });

    appt.status = 'approved';
    const updated = await appt.save();

    // Mark the slot as unavailable
    const availability = await Availability.findOne({ _id: appt.availabilityId, userId: appt.starId });
    if (availability) {
      const slot = availability.timeSlots.find((s) => String(s._id) === String(appt.timeSlotId));
      if (slot) {
        slot.status = 'unavailable';
        await availability.save();
      }
    }

    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const rejectAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { id } = req.params;
    const appt = await Appointment.findOne({ _id: id, starId: req.user._id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (appt.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending can be rejected' });
    appt.status = 'rejected';
    const updated = await appt.save();
    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { id } = req.params;
    const filter = { _id: id };
    if (req.user.role !== 'admin') filter.fanId = req.user._id;
    const appt = await Appointment.findOne(filter);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (appt.status === 'cancelled') return res.status(400).json({ success: false, message: 'Already cancelled' });

    // If previously approved, free the reserved slot
    if (appt.status === 'approved') {
      const availability = await Availability.findOne({ _id: appt.availabilityId, userId: appt.starId });
      if (availability) {
        const slot = availability.timeSlots.find((s) => String(s._id) === String(appt.timeSlotId));
        if (slot && slot.status === 'unavailable') {
          slot.status = 'available';
          await availability.save();
        }
      }
    }

    appt.status = 'cancelled';
    const updated = await appt.save();
    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const rescheduleAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { id } = req.params;
    const { availabilityId, timeSlotId } = req.body;

    const filter = { _id: id };
    if (req.user.role !== 'admin') filter.fanId = req.user._id;
    const appt = await Appointment.findOne(filter);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (appt.status === 'cancelled') return res.status(400).json({ success: false, message: 'Cannot reschedule a cancelled appointment' });

    // Verify new availability belongs to the same star and slot is available
    const availability = await Availability.findOne({ _id: availabilityId, userId: appt.starId });
    if (!availability) return res.status(404).json({ success: false, message: 'Availability not found for this star' });
    const newSlot = availability.timeSlots.find((s) => String(s._id) === String(timeSlotId));
    if (!newSlot) return res.status(404).json({ success: false, message: 'Time slot not found' });
    if (newSlot.status === 'unavailable') return res.status(409).json({ success: false, message: 'Time slot unavailable' });

    // If previously approved, free the old slot
    if (appt.status === 'approved') {
      const oldAvailability = await Availability.findOne({ _id: appt.availabilityId, userId: appt.starId });
      if (oldAvailability) {
        const oldSlot = oldAvailability.timeSlots.find((s) => String(s._id) === String(appt.timeSlotId));
        if (oldSlot && oldSlot.status === 'unavailable') {
          oldSlot.status = 'available';
          await oldAvailability.save();
        }
      }
    }

    // Update appointment to new slot and reset status to pending for re-approval
    appt.availabilityId = availabilityId;
    appt.timeSlotId = timeSlotId;
    appt.date = availability.date;
    appt.time = newSlot.slot;
    appt.status = 'pending';
    const updated = await appt.save();
    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

