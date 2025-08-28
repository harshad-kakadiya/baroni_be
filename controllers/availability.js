import { validationResult } from 'express-validator';
import Availability from '../models/Availability.js';

const sanitize = (doc) => ({
  id: doc._id,
  userId: doc.userId,
  date: doc.date,
  timeSlots: Array.isArray(doc.timeSlots)
    ? doc.timeSlots.map((t) => ({ id: t._id, slot: t.slot, status: t.status }))
    : [],
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const toAmPm = (time) => {
  if (typeof time !== 'string') throw new Error('Invalid time');
  const raw = time.trim();
  // Already AM/PM format
  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hh = parseInt(ampmMatch[1], 10);
    const mm = ampmMatch[2];
    const suffix = ampmMatch[3].toUpperCase();
    if (hh < 1 || hh > 12) throw new Error('Hour must be 1-12');
    if (parseInt(mm, 10) > 59) throw new Error('Minute must be 00-59');
    const hhStr = String(hh).padStart(2, '0');
    return `${hhStr}:${mm} ${suffix}`;
  }
  // 24-hour format
  const h24 = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (h24) {
    let hh24 = parseInt(h24[1], 10);
    const mm = h24[2];
    const suffix = hh24 >= 12 ? 'PM' : 'AM';
    let hh12 = hh24 % 12;
    if (hh12 === 0) hh12 = 12;
    const hhStr = String(hh12).padStart(2, '0');
    return `${hhStr}:${mm} ${suffix}`;
  }
  throw new Error('Invalid time format');
};

const normalizeTimeSlotString = (slot) => {
  if (typeof slot !== 'string') throw new Error('Invalid time slot');
  const parts = slot.split('-');
  if (parts.length !== 2) throw new Error('Time slot must be in start-end format');
  const start = toAmPm(parts[0]);
  const end = toAmPm(parts[1]);
  return `${start} - ${end}`;
};

export const createAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { date, timeSlots, status } = req.body;
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

    // Check if availability already exists for this date and user
    const existingAvailability = await Availability.findOne({ 
      userId: req.user._id, 
      date: String(date).trim() 
    });

    let result;
    if (existingAvailability) {
      // Merge new time slots with existing ones instead of replacing
      const existingSlots = existingAvailability.timeSlots || [];
      const newSlots = normalized;
      
      // Create a map of existing slots by slot string for easy lookup
      const existingSlotsMap = new Map();
      existingSlots.forEach(slot => {
        existingSlotsMap.set(slot.slot, slot);
      });
      
      // Merge new slots with existing ones
      // If a new slot has the same time, update it; otherwise add it
      newSlots.forEach(newSlot => {
        if (existingSlotsMap.has(newSlot.slot)) {
          // Update existing slot status if different
          const existingSlot = existingSlotsMap.get(newSlot.slot);
          if (existingSlot.status !== newSlot.status) {
            existingSlot.status = newSlot.status;
          }
        } else {
          // Add new slot
          existingSlots.push(newSlot);
        }
      });
      
      existingAvailability.timeSlots = existingSlots;
      result = await existingAvailability.save();
      return res.json({ success: true, data: sanitize(result), message: 'Availability updated successfully' });
    } else {
      // Create new availability
      result = await Availability.create({
        userId: req.user._id,
        date: String(date).trim(),
        timeSlots: normalized,
      });
      return res.status(201).json({ success: true, data: sanitize(result), message: 'Availability created successfully' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyAvailabilities = async (req, res) => {
  try {
    const items = await Availability.find({ userId: req.user._id }).sort({ date: 1, createdAt: -1 });
    return res.json({ success: true, data: items.map(sanitize) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const item = await Availability.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: sanitize(item) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { date, timeSlots, status } = req.body;
    const item = await Availability.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    if (date) item.date = String(date).trim();
    if (Array.isArray(timeSlots)) {
      try {
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
    return res.json({ success: true, data: sanitize(updated) });
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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const deleted = await Availability.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!deleted) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


