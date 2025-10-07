import express from 'express';
import { body, param } from 'express-validator';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { idParamValidator } from '../../validators/commonValidators.js';
import { createAvailability, listMyAvailabilities, getAvailability, updateAvailability, deleteAvailability, deleteTimeSlotByDate, deleteTimeSlotById } from '../../controllers/availability.js';

const router = express.Router();

router.use(requireAuth, requireRole('star', 'admin'));

const availabilityCreateValidator = [
  // Support both single date and multiple dates
  body().custom((value) => {
    // Check if it's the new multiple dates format
    if (value.dates && Array.isArray(value.dates)) {
      // Multiple dates format
      if (value.dates.length === 0) {
        throw new Error('At least one date must be provided');
      }
      // Validate each date object
      for (const dateObj of value.dates) {
        if (!dateObj.date || typeof dateObj.date !== 'string' || !dateObj.date.trim()) {
          throw new Error('Each date object must have a valid date field');
        }
        if (!dateObj.timeSlots || !Array.isArray(dateObj.timeSlots) || dateObj.timeSlots.length === 0) {
          throw new Error('Each date object must have at least one time slot');
        }
        // Validate time slots for each date
        for (const slot of dateObj.timeSlots) {
          if (typeof slot === 'string') {
            if (!slot.trim()) {
              throw new Error('Time slot strings cannot be empty');
            }
          } else if (slot && typeof slot === 'object') {
            const hasSlot = typeof slot.slot === 'string' && slot.slot.trim().length > 0;
            const hasStatus = slot.status === undefined || ['available', 'unavailable'].includes(slot.status);
            if (!hasSlot || !hasStatus) {
              throw new Error('Each time slot must be a non-empty string or an object { slot, status }');
            }
          } else {
            throw new Error('Each time slot must be a non-empty string or an object { slot, status }');
          }
        }
      }
      return true;
    } else if (value.date && value.timeSlots) {
      // Single date format (backward compatibility)
      if (typeof value.date !== 'string' || !value.date.trim()) {
        throw new Error('Date must be a non-empty string');
      }
      if (!Array.isArray(value.timeSlots) || value.timeSlots.length === 0) {
        throw new Error('At least one time slot must be provided');
      }
      // Validate time slots
      for (const slot of value.timeSlots) {
        if (typeof slot === 'string') {
          if (!slot.trim()) {
            throw new Error('Time slot strings cannot be empty');
          }
        } else if (slot && typeof slot === 'object') {
          const hasSlot = typeof slot.slot === 'string' && slot.slot.trim().length > 0;
          const hasStatus = slot.status === undefined || ['available', 'unavailable'].includes(slot.status);
          if (!hasSlot || !hasStatus) {
            throw new Error('Each time slot must be a non-empty string or an object { slot, status }');
          }
        } else {
          throw new Error('Each time slot must be a non-empty string or an object { slot, status }');
        }
      }
      return true;
    } else {
      throw new Error('Payload must contain either { date, timeSlots } or { dates: [{ date, timeSlots }] }');
    }
  }),
  body('isWeekly').optional().isBoolean(),
  body('isDaily').optional().isBoolean(),
];

const availabilityUpdateValidator = [
  body('date').optional().isString().trim().notEmpty(),
  body('timeSlots').optional().isArray({ min: 1 }),
  body('timeSlots.*')
    .optional()
    .custom((val) => {
      if (typeof val === 'string') return val.trim().length > 0;
      if (val && typeof val === 'object') {
        const hasSlot = typeof val.slot === 'string' && val.slot.trim().length > 0;
        const hasStatus = val.status === undefined || ['available', 'unavailable'].includes(val.status);
        return hasSlot && hasStatus;
      }
      return false;
    })
    .withMessage('Each time slot must be a non-empty string or an object { slot, status }'),
  body('isWeekly').optional().isBoolean(),
  body('isDaily').optional().isBoolean(),
];

const deleteSlotValidator = [
  body('date').isString().trim().notEmpty(),
  body('slot').isString().trim().notEmpty(),
  body('isDaily').optional().isBoolean(),
];

const deleteSlotByIdValidator = [
  param('id').isMongoId(),
  param('slotId').isMongoId(),
];

router.get('/', listMyAvailabilities);
router.get('/:id', idParamValidator, getAvailability);
// POST / - Create new availability or update existing one for the same date
router.post('/', availabilityCreateValidator, createAvailability);
router.put('/:id', idParamValidator, availabilityUpdateValidator, updateAvailability);
router.delete('/:id', idParamValidator, deleteAvailability);
// Delete a specific time slot for a date
router.delete('/slot', deleteSlotValidator, deleteTimeSlotByDate);
// Delete a specific time slot by its ID under an availability
router.delete('/:id/slots/:slotId', deleteSlotByIdValidator, deleteTimeSlotById);

export default router;


