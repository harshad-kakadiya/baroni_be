import express from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { idParamValidator } from '../../validators/commonValidators.js';
import { createAppointment, listAppointments, approveAppointment, rejectAppointment } from '../../controllers/appointment.js';

const router = express.Router();

router.use(requireAuth);

const createAppointmentValidator = [
  body('starId').isMongoId(),
  body('availabilityId').isMongoId(),
  body('timeSlotId').isMongoId(),
];

router.post('/', createAppointmentValidator, createAppointment);
router.get('/', listAppointments);
router.post('/:id/approve', requireRole('star', 'admin'), idParamValidator, approveAppointment);
router.post('/:id/reject', requireRole('star', 'admin'), idParamValidator, rejectAppointment);

export default router;


