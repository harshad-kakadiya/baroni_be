  import express from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { idParamValidator } from '../../validators/commonValidators.js';
import { createAppointment, listAppointments, approveAppointment, rejectAppointment, cancelAppointment, rescheduleAppointment, completeAppointment } from '../../controllers/appointment.js';

const router = express.Router();

router.use(requireAuth);

const createAppointmentValidator = [
  body('starId').isMongoId(),
  body('availabilityId').isMongoId(),
  body('timeSlotId').isMongoId(),
  body('price').isNumeric().withMessage('Price must be a number').isFloat({ min: 0 }).withMessage('Price must be greater than or equal to 0'),
];

router.post('/', createAppointmentValidator, createAppointment);
router.get('/', listAppointments);
router.post('/:id/approve', requireRole('star', 'admin'), idParamValidator, approveAppointment);
router.post('/:id/reject', requireRole('star', 'admin'), idParamValidator, rejectAppointment);
router.post('/:id/cancel', idParamValidator, cancelAppointment);
router.post('/:id/reschedule', [
  idParamValidator,
  body('availabilityId').isMongoId(),
  body('timeSlotId').isMongoId(),
], rescheduleAppointment);
router.post('/:id/complete', requireRole('star', 'admin'), idParamValidator, completeAppointment);

export default router;




