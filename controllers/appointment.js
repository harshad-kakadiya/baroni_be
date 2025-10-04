import { validationResult } from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import Availability from '../models/Availability.js';
import Appointment from '../models/Appointment.js';
import { createTransaction, createHybridTransaction, completeTransaction, cancelTransaction } from '../services/transactionService.js';
import { TRANSACTION_TYPES, TRANSACTION_DESCRIPTIONS, createTransactionDescription } from '../utils/transactionConstants.js';
import Transaction from '../models/Transaction.js'; // Added missing import for Transaction
import NotificationHelper from '../utils/notificationHelper.js';
import { deleteConversationBetweenUsers } from '../services/messagingCleanup.js';
import { sanitizeUserData } from '../utils/userDataHelper.js';

const toUser = (u) => u ? sanitizeUserData(u) : null;

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
  price: doc.price,
  status: doc.status,
  ...(doc.paymentStatus ? { paymentStatus: doc.paymentStatus } : {}),
  transactionId: doc.transactionId,
  // Keep transaction status light; paymentStatus covers domain payment lifecycle
  completedAt: doc.completedAt,
  callDuration: typeof doc.callDuration === 'number' ? doc.callDuration : undefined,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// Get single appointment details
export const getAppointmentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Appointment ID is required'
      });
    }

    // Find appointment - fans can only see their own, stars can see their own, admins can see all
    let filter = { _id: id };
    if (userRole === 'fan') {
      filter.fanId = userId;
    } else if (userRole === 'star') {
      filter.starId = userId;
    }
    // Admin can see all appointments (no additional filter)

    const appointment = await Appointment.findOne(filter)
      .populate('starId', 'name pseudo profilePic baroniId email contact role agoraKey')
      .populate('fanId', 'name pseudo profilePic baroniId email contact role agoraKey')
      .populate('availabilityId', 'date timeSlots')
      .populate('transactionId', 'amount status type')
      .lean();

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Add computed fields similar to listAppointments
    const parseStartDate = (dateStr, timeStr) => {
      const [year, month, day] = (dateStr || '').split('-').map((v) => parseInt(v, 10));
      let hours = 0;
      let minutes = 0;
      if (typeof timeStr === 'string') {
        const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (m) {
          hours = parseInt(m[1], 10);
          minutes = parseInt(m[2], 10);
          const ampm = m[3].toUpperCase();
          if (ampm === 'PM' && hours !== 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
        }
      }
      const d = new Date(year || 0, (month || 1) - 1, day || 1, hours, minutes, 0, 0);
      return d;
    };

    let timeSlotObj = undefined;
    if (appointment.availabilityId && appointment.availabilityId.timeSlots) {
      const found = appointment.availabilityId.timeSlots.find((s) => String(s._id) === String(appointment.timeSlotId));
      if (found) timeSlotObj = { id: found._id, slot: found.slot, status: found.status };
    }

    const startAt = parseStartDate(appointment.date, appointment.time);
    const timeToNowMs = startAt.getTime() - Date.now();

    const appointmentData = {
      ...sanitize(appointment),
      timeSlot: timeSlotObj,
      startAt: isNaN(startAt.getTime()) ? undefined : startAt.toISOString(),
      timeToNowMs
    };

    return res.status(200).json({
      success: true,
      message: 'Appointment details retrieved successfully',
      data: {
        appointment: appointmentData
      }
    });

  } catch (error) {
    console.error('Error fetching appointment details:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching appointment details',
      error: error.message
    });
  }
};

export const createAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    let { starId, starBaroniId, baroniId, availabilityId, timeSlotId, price, starName } = req.body;

    // Allow passing star by Baroni ID
    if (!starId && (starBaroniId || baroniId)) {
      const starByBaroni = await (await import('../models/User.js')).default.findOne({ baroniId: starBaroniId || baroniId, role: 'star' }).select('_id');
      if (!starByBaroni) return res.status(404).json({ success: false, message: 'Star not found' });
      starId = starByBaroni._id;
    }

    const availability = await Availability.findOne({ _id: availabilityId, userId: starId });
    if (!availability) return res.status(404).json({ success: false, message: 'Availability not found' });

    // Validate that the appointment date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const appointmentDate = new Date(availability.date);

    if (appointmentDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot book appointments for past dates'
      });
    }

    // If the appointment is for today, validate that the time slot is not in the past
    const isToday = appointmentDate.getTime() === today.getTime();
    if (isToday) {
      const slot = availability.timeSlots.find((s) => String(s._id) === String(timeSlotId));
      if (slot) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const timeMatch = slot.slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          let hour = parseInt(timeMatch[1], 10);
          const minute = parseInt(timeMatch[2], 10);
          const ampm = timeMatch[3].toUpperCase();

          if (ampm === 'PM' && hour !== 12) hour += 12;
          if (ampm === 'AM' && hour === 12) hour = 0;

          const slotTime = hour * 60 + minute;
          if (slotTime <= currentTime) {
            return res.status(400).json({
              success: false,
              message: `Cannot book appointments for past time slots. Time slot "${slot.slot}" is in the past.`
            });
          }
        }
      }
    }

    const slot = availability.timeSlots.find((s) => String(s._id) === String(timeSlotId));
    if (!slot) return res.status(404).json({ success: false, message: 'Time slot unavailable' });
    if (slot.status === 'unavailable') return res.status(409).json({ success: false, message: 'Time slot unavailable' });

    // Create hybrid transaction before creating appointment
    let transactionResult;
    try {
      const { contact: payloadContact } = req.body || {};
      const { normalizeContact } = await import('../utils/normalizeContact.js');
      const normalizedPhone = normalizeContact(payloadContact || '');
      if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: 'User phone number is required' });
      }
      transactionResult = await createHybridTransaction({
        type: TRANSACTION_TYPES.APPOINTMENT_PAYMENT,
        payerId: req.user._id,
        receiverId: starId,
        amount: price,
        description: createTransactionDescription(TRANSACTION_TYPES.APPOINTMENT_PAYMENT, req.user.name || req.user.pseudo || '', starName || '', req.user.role || 'fan', 'star'),
        userPhone: normalizedPhone,
        starName: starName || '',
        metadata: {
          appointmentType: 'booking',
          availabilityId,
          timeSlotId,
          date: availability.date,
          time: slot.slot,
          payerName: req.user.name || req.user.pseudo || ''
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
      type: TRANSACTION_TYPES.APPOINTMENT_PAYMENT,
      status: { $in: ['pending', 'initiated'] }
    }).sort({ createdAt: -1 });

    if (!transaction) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction'
      });
    }

    const created = await Appointment.create({
      starId,
      fanId: req.user._id,
      availabilityId,
      timeSlotId,
      date: availability.date,
      time: slot.slot,
      price,
      status: 'pending',
      paymentStatus: transaction.status === 'initiated' ? 'initiated' : 'pending',
      transactionId: transaction._id,
    });

    // Reserve the slot immediately for all bookings (hybrid or coin-only)
    try {
      // Atomic update to avoid race conditions
      await Availability.updateOne(
        { _id: availabilityId, userId: starId, 'timeSlots._id': timeSlotId, 'timeSlots.status': 'available' },
        { $set: { 'timeSlots.$.status': 'unavailable' } }
      );
    } catch (_e) {}

    // Send notification to star about new appointment request
    try {
      await NotificationHelper.sendAppointmentNotification('APPOINTMENT_CREATED', created, { currentUserId: req.user._id });
    } catch (notificationError) {
      console.error('Error sending appointment notification:', notificationError);
    }

    const responseBody = { 
      success: true, 
      message: 'Appointment created successfully',
      data: {
        appointment: sanitize(created)
      }
    };
    if (transactionResult && transactionResult.paymentMode === 'hybrid' || transactionResult?.externalAmount > 0) {
      if (transactionResult.externalPaymentMessage) {
        responseBody.data.externalPaymentMessage = transactionResult.externalPaymentMessage;
      }
    }
    return res.status(201).json(responseBody);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listAppointments = async (req, res) => {
  try {
    const isStar = req.user.role === 'star' || req.user.role === 'admin';
    const filter = isStar ? { starId: req.user._id } : { fanId: req.user._id };
    // Optional date filtering: exact date or range via startDate/endDate (expects YYYY-MM-DD strings)
    const { date, startDate, endDate } = req.query || {};
    if (date && typeof date === 'string' && date.trim()) {
      filter.date = date.trim();
    } else if ((startDate && typeof startDate === 'string') || (endDate && typeof endDate === 'string')) {
      const range = {};
      if (startDate && startDate.trim()) range.$gte = startDate.trim();
      if (endDate && endDate.trim()) range.$lte = endDate.trim();
      if (Object.keys(range).length > 0) filter.date = range;
    }
    const items = await Appointment.find(filter)
      .populate('starId', 'name pseudo profilePic baroniId email contact role agoraKey')
      .populate('fanId', 'name pseudo profilePic baroniId email contact role agoraKey')
      .populate('availabilityId')
      .sort({ createdAt: -1 });

    const parseStartDate = (dateStr, timeStr) => {
      const [year, month, day] = (dateStr || '').split('-').map((v) => parseInt(v, 10));
      let hours = 0;
      let minutes = 0;
      if (typeof timeStr === 'string') {
        const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (m) {
          hours = parseInt(m[1], 10);
          minutes = parseInt(m[2], 10);
          const ampm = m[3].toUpperCase();
          if (ampm === 'PM' && hours !== 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
        }
      }
      const d = new Date(year || 0, (month || 1) - 1, day || 1, hours, minutes, 0, 0);
      return d;
    };

    const withComputed = items.map((doc) => {
      const base = sanitize(doc);
      let timeSlotObj = undefined;
      if (doc.availabilityId && doc.availabilityId.timeSlots) {
        const found = doc.availabilityId.timeSlots.find((s) => String(s._id) === String(doc.timeSlotId));
        if (found) timeSlotObj = { id: found._id, slot: found.slot, status: found.status };
      }
      const startAt = parseStartDate(base.date, base.time);
      const timeToNowMs = startAt.getTime() - Date.now();
      return { ...base, timeSlot: timeSlotObj, startAt: isNaN(startAt.getTime()) ? undefined : startAt.toISOString(), timeToNowMs };
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
    // Keep cancelled at the very end; sort by most recent update descending inside cancelled
    cancelled.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const data = [...future, ...past, ...cancelled];

    return res.json({ 
      success: true, 
      message: 'Appointments retrieved successfully',
      data: data
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const approveAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { id } = req.params;
    const appt = await Appointment.findOne({ _id: id, starId: req.user._id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (appt.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending can be approved' });

    appt.status = 'approved';
    const updated = await appt.save();

    const availability = await Availability.findOne({ _id: appt.availabilityId, userId: appt.starId });
    if (availability) {
      const slot = availability.timeSlots.find((s) => String(s._id) === String(appt.timeSlotId));
      if (slot) {
        slot.status = 'unavailable';
        await availability.save();
      }
    }

    // Send notification to fan about appointment approval
    try {
      await NotificationHelper.sendAppointmentNotification('APPOINTMENT_ACCEPTED', updated, { currentUserId: req.user._id });
    } catch (notificationError) {
      console.error('Error sending appointment approval notification:', notificationError);
    }

    return res.json({ 
      success: true, 
      message: 'Appointment approved successfully',
      data: {
        appointment: sanitize(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const rejectAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { id } = req.params;
    const appt = await Appointment.findOne({ _id: id, starId: req.user._id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (appt.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending can be rejected' });
    appt.status = 'rejected';
    // Cancel and refund the pending transaction, if any
    if (appt.transactionId) {
      try {
        await cancelTransaction(appt.transactionId);
      } catch (transactionError) {
        console.error('Failed to cancel transaction for rejected appointment:', transactionError);
        // Proceed with rejection even if refund fails
      }
    }
    const updated = await appt.save();

    // Free the reserved slot if it was marked unavailable (pending hybrid reservation)
    try {
      await Availability.updateOne(
        { _id: appt.availabilityId, userId: appt.starId, 'timeSlots._id': appt.timeSlotId },
        { $set: { 'timeSlots.$.status': 'available' } }
      );
    } catch (_e) {}

    // Send notification to fan about appointment rejection
    try {
      await NotificationHelper.sendAppointmentNotification('APPOINTMENT_REJECTED', updated, { currentUserId: req.user._id });
    } catch (notificationError) {
      console.error('Error sending appointment rejection notification:', notificationError);
    }

    return res.json({ 
      success: true, 
      message: 'Appointment rejected successfully',
      data: {
        appointment: sanitize(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { id } = req.params;
    const filter = { _id: id };
    if (req.user.role !== 'admin') filter.fanId = req.user._id;
    const appt = await Appointment.findOne(filter);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (appt.status === 'cancelled') return res.status(400).json({ success: false, message: 'Already cancelled' });

    // Cancel the transaction and refund coins if it's pending
    if (appt.transactionId && appt.status === 'pending') {
      try {
        await cancelTransaction(appt.transactionId);
      } catch (transactionError) {
        console.error('Failed to cancel transaction:', transactionError);
        // Continue with appointment cancellation even if transaction cancellation fails
      }
    }

    // Free the reserved slot (for approved or pending hybrid-reserved)
    try {
      await Availability.updateOne(
        { _id: appt.availabilityId, userId: appt.starId, 'timeSlots._id': appt.timeSlotId },
        { $set: { 'timeSlots.$.status': 'available' } }
      );
    } catch (_e) {}

    appt.status = 'cancelled';
    const updated = await appt.save();

    // Notify counterpart only: if star cancelled, notify fan; if fan cancelled, notify star
    try {
      await NotificationHelper.sendAppointmentNotification('APPOINTMENT_CANCELLED', updated, { currentUserId: req.user._id });
    } catch (notificationError) {
      console.error('Error sending appointment cancellation notification:', notificationError);
    }
    return res.json({ 
      success: true, 
      message: 'Appointment cancelled successfully',
      data: {
        appointment: sanitize(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const rescheduleAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
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

    // Validate that the rescheduled date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rescheduleDate = new Date(availability.date);

    if (rescheduleDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reschedule appointments to past dates'
      });
    }

    // If rescheduling to today, validate that the time slot is not in the past
    const isToday = rescheduleDate.getTime() === today.getTime();
    if (isToday) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      const timeMatch = availability.timeSlots.find(s => String(s._id) === String(timeSlotId))?.slot?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);
        const ampm = timeMatch[3].toUpperCase();

        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;

        const slotTime = hour * 60 + minute;
        if (slotTime <= currentTime) {
          return res.status(400).json({
            success: false,
            message: `Cannot reschedule appointments to past time slots. Time slot is in the past.`
          });
        }
      }
    }

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
    return res.json({ 
      success: true, 
      message: 'Appointment rescheduled successfully',
      data: {
        appointment: sanitize(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const completeAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { id } = req.params;
    const { callDuration } = req.body;
    const appt = await Appointment.findOne({ _id: id, starId: req.user._id });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
    if (appt.status !== 'approved') return res.status(400).json({ success: false, message: 'Only approved appointments can be completed' });

    // Complete the transaction and transfer coins to star
    if (appt.transactionId) {
      try {
        await completeTransaction(appt.transactionId);
      } catch (transactionError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to complete transaction: ' + transactionError.message
        });
      }
    }

    appt.status = 'completed';
    appt.paymentStatus = 'completed';
    appt.completedAt = new Date();
    appt.callDuration = callDuration;
    const updated = await appt.save();

    // Cleanup messages between fan and star after completion
    try {
      await deleteConversationBetweenUsers(appt.fanId, appt.starId);
    } catch (_e) {}

    return res.json({ 
      success: true, 
      message: 'Appointment completed successfully',
      data: {
        appointment: sanitize(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};



