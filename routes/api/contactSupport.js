import express from 'express';
import {
  createSupportTicket,
  getUserSupportTickets,
  getSupportTicketById,
  updateSupportTicket,
  deleteSupportTicket,
  getAllSupportTickets
} from '../../controllers/contactSupport.js';
import {
  createSupportTicketValidator,
  updateSupportTicketValidator,
  getSupportTicketByIdValidator,
  deleteSupportTicketValidator,
  adminGetAllTicketsValidator
} from '../../validators/contactSupportValidators.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { uploadMixed } from '../../middlewares/upload.js';

const router = express.Router();

router.post(
  '/',
  uploadMixed.any(),
  createSupportTicketValidator,
  createSupportTicket
);

router.get(
  '/my-tickets',
  getUserSupportTickets
);

router.get(
  '/:id',
  getSupportTicketByIdValidator,
  getSupportTicketById
);

router.put(
  '/:id',
  uploadMixed.any(),
  updateSupportTicketValidator,
  updateSupportTicket
);

router.delete(
  '/:id',
  deleteSupportTicketValidator,
  deleteSupportTicket
);

// Admin routes (require admin role)
router.get(
  '/admin/all',
  requireRole('admin'),
  adminGetAllTicketsValidator,
  getAllSupportTickets
);

export default router;
