import { body } from 'express-validator';

export const createDedicationRequestValidator = [
  body('starId').isMongoId().withMessage('Valid star ID is required'),
  body('occasion').isString().trim().notEmpty().withMessage('Occasion is required'),
  body('eventName').isString().trim().notEmpty().withMessage('Event name is required'),
  body('eventDate').isISO8601().toDate().withMessage('Valid event date is required'),
  body('description').isString().trim().notEmpty().withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required')
];


