import { body, param, query } from 'express-validator';

// Validation for creating a support ticket
export const createSupportTicketValidator = [
  body('issueType'),
  body('description')
    .trim()
];

// Validation for updating a support ticket
export const updateSupportTicketValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ticket ID'),
  body('issueType')
    .optional(),
  body('description')
    .optional()
    .trim()
];

// Validation for getting a specific support ticket
export const getSupportTicketByIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ticket ID')
];

// Validation for deleting a support ticket
export const deleteSupportTicketValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ticket ID')
];

// Validation for admin getting all tickets
export const adminGetAllTicketsValidator = [
  query('issueType')
    .optional()
];
