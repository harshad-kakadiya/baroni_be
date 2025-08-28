import express from 'express';
import { body, param } from 'express-validator';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { idParamValidator } from '../../validators/commonValidators.js';
import { createAvailability, listMyAvailabilities, getAvailability, updateAvailability, deleteAvailability, deleteTimeSlotByDate, deleteTimeSlotById } from '../../controllers/availability.js';

const router = express.Router();

router.use(requireAuth, requireRole('star', 'admin'));

const availabilityCreateValidator = [
  body('date').isString().trim().notEmpty(), // YYYY-MM-DD
  body('timeSlots').isArray({ min: 1 }),
  body('timeSlots.*').custom((val) => {
    if (typeof val === 'string') return val.trim().length > 0;
    if (val && typeof val === 'object') {
      const hasSlot = typeof val.slot === 'string' && val.slot.trim().length > 0;
      const hasStatus = val.status === undefined || ['available', 'unavailable'].includes(val.status);
      return hasSlot && hasStatus;
    }
    return false;
  }).withMessage('Each time slot must be a non-empty string or an object { slot, status }'),
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
];

const deleteSlotValidator = [
  body('date').isString().trim().notEmpty(),
  body('slot').isString().trim().notEmpty(),
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


