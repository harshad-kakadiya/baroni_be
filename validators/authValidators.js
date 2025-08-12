import { body } from 'express-validator';

export const registerValidator = [
  body('contact').optional().isString().trim(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').isString().trim().notEmpty(),
  body('pseudo').isString().trim().notEmpty(),
  body('profilePic').optional().isURL().withMessage('profilePic must be a valid URL'),
  body('preferredLanguage').optional().isString().isLength({ min: 2, max: 5 }),
  body('country').optional().isString().isLength({ min: 2, max: 56 }),
];

export const loginValidator = [
  body('identifier').isString().notEmpty(),
  body('password').isString().notEmpty(),
];


