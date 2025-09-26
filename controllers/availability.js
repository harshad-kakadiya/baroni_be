import { validationResult } from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import Availability from '../models/Availability.js';
import Appointment from '../models/Appointment.js'; // Added import for Appointment
import { cleanupWeeklyAvailabilities, deleteTimeSlotFromWeeklyAvailabilities, deleteTimeSlotByIdFromWeeklyAvailabilities } from '../services/weeklyAvailabilityService.js';

const sanitize = (doc) => ({
  id: doc._id,
  userId: doc.userId,
  date: doc.date,
  isWeekly: !!doc.isWeekly,
  timeSlots: Array.isArray(doc.timeSlots)
    ? doc.timeSlots.map((t) => ({ id: t._id, slot: t.slot, status: t.status }))
    : [],
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const to24Hour = (time) => {
  if (typeof time !== 'string') throw new Error('Invalid time');
  const raw = time.trim();
  
  // Already 24-hour format
  const h24Match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (h24Match) {
    const hh = parseInt(h24Match[1], 10);
    const mm = h24Match[2];
    if (parseInt(mm, 10) > 59) throw new Error('Minute must be 00-59');
    const hhStr = String(hh).padStart(2, '0');
    return `${hhStr}:${mm}`;
  }
  
  // AM/PM format (for backward compatibility)
  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hh = parseInt(ampmMatch[1], 10);
    const mm = ampmMatch[2];
    const suffix = ampmMatch[3].toUpperCase();
    if (hh < 1 || hh > 12) throw new Error('Hour must be 1-12');
    if (parseInt(mm, 10) > 59) throw new Error('Minute must be 00-59');
    
    // Convert to 24-hour format
    if (suffix === 'PM' && hh !== 12) hh += 12;
    if (suffix === 'AM' && hh === 12) hh = 0;
    
    const hhStr = String(hh).padStart(2, '0');
    return `${hhStr}:${mm}`;
  }
  
  throw new Error('Invalid time format. Expected HH:MM (24-hour) or HH:MM AM/PM');
};

const normalizeTimeSlotString = (slot) => {
  if (typeof slot !== 'string') throw new Error('Invalid time slot');
  const parts = slot.split('-');
  if (parts.length !== 2) throw new Error('Time slot must be in start-end format');
  const start = to24Hour(parts[0]);
  const end = to24Hour(parts[1]);
  return `${start} - ${end}`;
};

// Parse a YYYY-MM-DD string into a local Date at midnight (avoids UTC shift)
const parseLocalYMD = (ymd) => {
  const s = String(ymd || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Invalid date format; expected YYYY-MM-DD');
  const year = parseInt(m[1], 10);
  const monthIndex = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  return new Date(year, monthIndex, day);
};

// Format a Date into YYYY-MM-DD using local time
const formatLocalYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const createAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { date, timeSlots } = req.body;
    const isWeekly = Boolean(req.body.isWeekly);
    
    // Only cleanup weekly availabilities if isWeekly is explicitly set to false in payload
    if (req.body.hasOwnProperty('isWeekly') && !isWeekly) {
      try {
        await cleanupWeeklyAvailabilities(req.user._id);
      } catch (error) {
        console.error('Error during weekly cleanup:', error);
        // Continue with normal flow even if cleanup fails
      }
    }

    // Validate that the date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today
    const inputDate = parseLocalYMD(date);
    
    if (inputDate < today) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot create availability for past dates' 
      });
    }

    // If the date is today, validate that time slots are not in the past
    const isToday = inputDate.getTime() === today.getTime();
    if (isToday) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
      
      // Validate time slots are not in the past
      for (const timeSlot of timeSlots) {
        const slotString = typeof timeSlot === 'string' ? timeSlot : timeSlot.slot;
        const parts = slotString.split(' - ');
        if (parts.length === 2) {
          const startTime = parts[0].trim();
          
          // Only check the start time, not the end time
          const timeMatch = startTime.match(/^(\d{1,2}):(\d{2})$/);
          if (timeMatch) {
            const hour = parseInt(timeMatch[1], 10);
            const minute = parseInt(timeMatch[2], 10);
            
            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
              const slotTime = hour * 60 + minute;
              if (slotTime <= currentTime) {
                return res.status(400).json({ 
                  success: false, 
                  message: `Cannot create availability for past time slots. Time slot "${slotString}" is in the past.` 
                });
              }
            }
          }
        }
      }
    }

    let normalized = [];
    try {
      normalized = Array.isArray(timeSlots)
        ? timeSlots.map((t) => {
            if (typeof t === 'string') {
              return { slot: normalizeTimeSlotString(String(t)), status: 'available' };
            }
            if (t && typeof t === 'object') {
              const slot = normalizeTimeSlotString(String(t.slot || ''));
              const status = t.status === 'unavailable' ? 'unavailable' : 'available';
              return { slot, status };
            }
            throw new Error('Invalid time slot entry');
          })
        : [];
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid timeSlots: provide strings or { slot, status } with valid formats' });
    }

    const upsertOne = async (isoDateStr) => {
      const existingAvailability = await Availability.findOne({
        userId: req.user._id,
        date: String(isoDateStr).trim(),
      });

      if (existingAvailability) {
        const existingSlots = existingAvailability.timeSlots || [];
        const newSlots = normalized;
        const existingSlotsMap = new Map();
        existingSlots.forEach((slot) => {
          existingSlotsMap.set(slot.slot, slot);
        });
        newSlots.forEach((newSlot) => {
          if (existingSlotsMap.has(newSlot.slot)) {
            const existingSlot = existingSlotsMap.get(newSlot.slot);
            if (existingSlot.status !== newSlot.status) {
              existingSlot.status = newSlot.status;
            }
          } else {
            existingSlots.push(newSlot);
          }
        });
        existingAvailability.timeSlots = existingSlots;
        if (isWeekly) existingAvailability.isWeekly = true;
        const saved = await existingAvailability.save();
        return { action: 'updated', doc: saved };
      }

      const created = await Availability.create({
        userId: req.user._id,
        date: String(isoDateStr).trim(),
        isWeekly,
        timeSlots: normalized,
      });
      return { action: 'created', doc: created };
    };

    if (!isWeekly) {
      const { action, doc } = await upsertOne(String(date).trim());
      const statusCode = action === 'created' ? 201 : 200;
      const message = action === 'created' ? 'Availability created successfully' : 'Availability updated successfully';
      return res.status(statusCode).json({ success: true, data: sanitize(doc), message });
    }

    // isWeekly: create for the given date and next 5 same weekdays (6 total)
    const dates = [];
    const start = parseLocalYMD(date);
    for (let i = 0; i < 6; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i * 7);
      const iso = formatLocalYMD(d);
      dates.push(iso);
    }

    const results = [];
    for (const d of dates) {
      // All generated dates are >= start, which we've already validated is not in the past
      const r = await upsertOne(d);
      results.push(sanitize(r.doc));
    }
    return res.status(201).json({ success: true, data: results, message: 'Weekly availabilities created/updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyAvailabilities = async (req, res) => {
  try {
    const items = await Availability.find({ userId: req.user._id }).sort({ date: 1, createdAt: -1 });
    return res.json({ 
      success: true, 
      message: 'Availabilities retrieved successfully',
      data: {
        availabilities: items.map(sanitize)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const item = await Availability.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ 
      success: true, 
      message: 'Availability retrieved successfully',
      data: {
        availability: sanitize(item)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { date, timeSlots, status, isWeekly } = req.body;
    const item = await Availability.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    
    // Handle isWeekly field if provided in payload
    if (req.body.hasOwnProperty('isWeekly')) {
      const newIsWeekly = Boolean(isWeekly);
      
      // Only cleanup weekly availabilities if isWeekly is explicitly set to false
      if (!newIsWeekly) {
        try {
          await cleanupWeeklyAvailabilities(req.user._id);
        } catch (error) {
          console.error('Error during weekly cleanup:', error);
          // Continue with normal flow even if cleanup fails
        }
      }
      
      item.isWeekly = newIsWeekly;
    }
    
    // Validate date if provided
    if (date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const inputDate = new Date(date);
      
      if (inputDate < today) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot update availability to past dates' 
        });
      }
      item.date = String(date).trim();
    }
    if (Array.isArray(timeSlots)) {
      try {
        // If updating time slots for today, validate they're not in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const itemDate = new Date(item.date);
        const isToday = itemDate.getTime() === today.getTime();
        
        if (isToday) {
          const now = new Date();
          const currentTime = now.getHours() * 60 + now.getMinutes();
          
          for (const timeSlot of timeSlots) {
            const slotString = typeof timeSlot === 'string' ? timeSlot : timeSlot.slot;
            const parts = slotString.split(' - ');
            if (parts.length === 2) {
              const startTime = parts[0].trim();
              
              // Only check the start time, not the end time
              const timeMatch = startTime.match(/^(\d{1,2}):(\d{2})$/);
              if (timeMatch) {
                const hour = parseInt(timeMatch[1], 10);
                const minute = parseInt(timeMatch[2], 10);
                
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                  const slotTime = hour * 60 + minute;
                  if (slotTime <= currentTime) {
                    return res.status(400).json({ 
                      success: false, 
                      message: `Cannot update availability with past time slots. Time slot "${slotString}" is in the past.` 
                    });
                  }
                }
              }
            }
          }
        }
        
        item.timeSlots = timeSlots.map((t) => {
          if (typeof t === 'string') {
            return { slot: normalizeTimeSlotString(String(t)), status: 'available' };
          }
          if (t && typeof t === 'object') {
            const slot = normalizeTimeSlotString(String(t.slot || ''));
            const s = t.status === 'unavailable' ? 'unavailable' : 'available';
            return { slot, status: s };
          }
          throw new Error('Invalid time slot entry');
        });
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid timeSlots: provide strings or { slot, status } with valid formats' });
      }
    }
    const updated = await item.save();
    return res.json({ 
      success: true, 
      message: 'Availability updated successfully',
      data: {
        availability: sanitize(updated)
      }
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Availability for this date already exists' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const deleted = await Availability.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!deleted) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ 
      success: true, 
      message: 'Availability deleted successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteTimeSlotByDate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const date = String(req.body.date || '').trim();
    let slotToDelete;
    try {
      slotToDelete = normalizeTimeSlotString(String(req.body.slot || ''));
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid slot format' });
    }

    const availability = await Availability.findOne({ userId: req.user._id, date });
    if (!availability) return res.status(404).json({ success: false, message: 'Availability for this date not found' });

    // Find the specific time slot to check its status
    const timeSlot = availability.timeSlots.find((t) => t.slot === slotToDelete);
    if (!timeSlot) {
      return res.status(404).json({ success: false, message: 'Time slot not found' });
    }

    // Check if the time slot is booked (unavailable status)
    if (timeSlot.status === 'unavailable') {
      // Check if there are any pending or approved appointments for this slot
      const appointment = await Appointment.findOne({
        starId: req.user._id,
        availabilityId: availability._id,
        timeSlotId: timeSlot._id,
        status: { $in: ['pending', 'approved'] }
      });

      if (appointment) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete this time slot. It has an active appointment. Please complete or reject the appointment first.',
          data: {
            appointmentId: appointment._id,
            appointmentStatus: appointment.status,
            fanId: appointment.fanId
          }
        });
      }
    }

    // If this is a weekly availability, delete the time slot from all weekly availabilities
    if (availability.isWeekly) {
      try {
        const weeklyResult = await deleteTimeSlotFromWeeklyAvailabilities(req.user._id, slotToDelete);
        return res.json({ 
          success: true, 
          message: `Time slot deleted from ${weeklyResult.processed} weekly availabilities (${weeklyResult.updated} updated, ${weeklyResult.removed} removed)`,
          data: { weeklyResult }
        });
      } catch (error) {
        console.error('Error deleting from weekly availabilities:', error);
        return res.status(500).json({ success: false, message: 'Error deleting from weekly availabilities' });
      }
    }

    // Handle non-weekly availability
    const beforeCount = availability.timeSlots.length;
    const remaining = (availability.timeSlots || []).filter((t) => t.slot !== slotToDelete);

    if (remaining.length === beforeCount) {
      return res.status(404).json({ success: false, message: 'Time slot not found' });
    }

    if (remaining.length === 0) {
      await availability.deleteOne();
      return res.json({ 
        success: true, 
        message: 'Time slot deleted and availability removed (no remaining slots)'
      });
    }

    availability.timeSlots = remaining;
    const saved = await availability.save();
    return res.json({ 
      success: true, 
      message: 'Time slot deleted successfully',
      data: {
        availability: sanitize(saved)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteTimeSlotById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const availabilityId = req.params.id;
    const slotId = req.params.slotId;

    const availability = await Availability.findOne({ _id: availabilityId, userId: req.user._id });
    if (!availability) return res.status(404).json({ success: false, message: 'Availability not found' });

    // Find the specific time slot to check its status
    const timeSlot = availability.timeSlots.find((t) => String(t._id) === String(slotId));
    if (!timeSlot) {
      return res.status(404).json({ success: false, message: 'Time slot not found' });
    }

    // Check if the time slot is booked (unavailable status)
    if (timeSlot.status === 'unavailable') {
      // Check if there are any pending or approved appointments for this slot
      const appointment = await Appointment.findOne({
        starId: req.user._id,
        availabilityId: availability._id,
        timeSlotId: timeSlot._id,
        status: { $in: ['pending', 'approved'] }
      });

      if (appointment) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete this time slot. It has an active appointment. Please complete or reject the appointment first.',
          data: {
            appointmentId: appointment._id,
            appointmentStatus: appointment.status,
            fanId: appointment.fanId
          }
        });
      }
    }

    // If this is a weekly availability, delete the time slot from all weekly availabilities
    if (availability.isWeekly) {
      try {
        const weeklyResult = await deleteTimeSlotByIdFromWeeklyAvailabilities(req.user._id, slotId);
        return res.json({ 
          success: true, 
          message: `Time slot deleted from ${weeklyResult.processed} weekly availabilities (${weeklyResult.updated} updated, ${weeklyResult.removed} removed)`,
          data: { weeklyResult }
        });
      } catch (error) {
        console.error('Error deleting from weekly availabilities:', error);
        return res.status(500).json({ success: false, message: 'Error deleting from weekly availabilities' });
      }
    }

    // Handle non-weekly availability
    const beforeCount = availability.timeSlots.length;
    availability.timeSlots = (availability.timeSlots || []).filter((t) => String(t._id) !== String(slotId));

    if (availability.timeSlots.length === beforeCount) {
      return res.status(404).json({ success: false, message: 'Time slot not found' });
    }

    if (availability.timeSlots.length === 0) {
      await availability.deleteOne();
      return res.json({ 
        success: true, 
        data: {
          message: 'Time slot deleted and availability removed (no remaining slots)'
        }
      });
    }

    const saved = await availability.save();
    return res.json({ 
      success: true, 
      data: {
        message: 'Time slot deleted successfully',
        availability: sanitize(saved)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


