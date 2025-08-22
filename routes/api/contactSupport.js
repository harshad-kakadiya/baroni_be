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

// User routes (require authentication)
router.post(
  '/',
  requireAuth,
  uploadMixed.any(),
  createSupportTicketValidator,
  createSupportTicket
);

router.get(
  '/my-tickets',
  requireAuth,
  getUserSupportTickets
);

router.get(
  '/:id',
  requireAuth,
  getSupportTicketByIdValidator,
  getSupportTicketById
);

router.put(
  '/:id',
  requireAuth,
  uploadMixed.any(),
  updateSupportTicketValidator,
  updateSupportTicket
);

router.delete(
  '/:id',
  requireAuth,
  deleteSupportTicketValidator,
  deleteSupportTicket
);

// Admin routes (require admin role)
router.get(
  '/admin/all',
  requireAuth,
  requireRole('admin'),
  adminGetAllTicketsValidator,
  getAllSupportTickets
);

export default router;
