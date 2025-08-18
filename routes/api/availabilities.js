import express from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { idParamValidator } from '../../validators/commonValidators.js';
import { createAvailability, listMyAvailabilities, getAvailability, updateAvailability, deleteAvailability } from '../../controllers/availability.js';

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

router.get('/', listMyAvailabilities);
router.get('/:id', idParamValidator, getAvailability);
router.post('/', availabilityCreateValidator, createAvailability);
router.put('/:id', idParamValidator, availabilityUpdateValidator, updateAvailability);
router.delete('/:id', idParamValidator, deleteAvailability);

export default router;


