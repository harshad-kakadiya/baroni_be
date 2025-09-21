import { validationResult } from 'express-validator';
import Availability from '../models/Availability.js';
import Appointment from '../models/Appointment.js';
import { createTransaction, createHybridTransaction, completeTransaction, cancelTransaction } from '../services/transactionService.js';
import { TRANSACTION_TYPES, TRANSACTION_DESCRIPTIONS } from '../utils/transactionConstants.js';
import Transaction from '../models/Transaction.js'; // Added missing import for Transaction
import NotificationHelper from '../utils/notificationHelper.js';
import { deleteConversationBetweenUsers } from '../services/messagingCleanup.js';

const toUser = (u) => (
  u && u._id ? {
    id: u._id,
    name: u.name,
    pseudo: u.pseudo,
    profilePic: u.profilePic,
    email: u.email,
    contact: u.contact,
    baroniId: u.baroniId,
    role: u.role,
    agoraKey: u.agoraKey,
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
  price: doc.price,
  status: doc.status,
  transactionId: doc.transactionId,
  completedAt: doc.completedAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export const createAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { starId, availabilityId, timeSlotId, price, starName } = req.body;

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
        description: TRANSACTION_DESCRIPTIONS[TRANSACTION_TYPES.APPOINTMENT_PAYMENT],
        userPhone: normalizedPhone,
        starName,
        metadata: {
          appointmentType: 'booking',
          availabilityId,
          timeSlotId,
          date: availability.date,
          time: slot.slot
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
      transactionId: transaction._id,
    });

    // Send notification to star about new appointment request
    try {
      await NotificationHelper.sendAppointmentNotification('APPOINTMENT_CREATED', created);
    } catch (notificationError) {
      console.error('Error sending appointment notification:', notificationError);
    }

    const responseBody = { success: true, data: sanitize(created) };
    if (transactionResult && transactionResult.paymentMode === 'hybrid' || transactionResult?.externalAmount > 0) {
      if (transactionResult.externalPaymentMessage) {
        responseBody.externalPaymentMessage = transactionResult.externalPaymentMessage;
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
    const items = await Appointment.find(filter)
      .populate('starId', 'name pseudo profilePic baroniId email contact role agoraKey')
      .populate('fanId', 'name pseudo profilePic baroniId email contact role agoraKey')
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
      await NotificationHelper.sendAppointmentNotification('APPOINTMENT_ACCEPTED', updated);
    } catch (notificationError) {
      console.error('Error sending appointment approval notification:', notificationError);
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

    // Send notification to fan about appointment rejection
    try {
      await NotificationHelper.sendAppointmentNotification('APPOINTMENT_REJECTED', updated);
    } catch (notificationError) {
      console.error('Error sending appointment rejection notification:', notificationError);
    }

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

    // Cancel the transaction and refund coins if it's pending
    if (appt.transactionId && appt.status === 'pending') {
      try {
        await cancelTransaction(appt.transactionId);
      } catch (transactionError) {
        console.error('Failed to cancel transaction:', transactionError);
        // Continue with appointment cancellation even if transaction cancellation fails
      }
    }

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
    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const completeAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
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
    appt.completedAt = new Date();
    appt.callDuration = callDuration;
    const updated = await appt.save();

    // Cleanup messages between fan and star after completion
    try {
      await deleteConversationBetweenUsers(appt.fanId, appt.starId);
    } catch (_e) {}

    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};



