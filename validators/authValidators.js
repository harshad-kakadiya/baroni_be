import { body } from 'express-validator';

export const registerValidator = [
  body('contact').isString().trim().notEmpty().withMessage('Contact is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
];


export const loginValidator = [
  body('contact').isString().notEmpty(),
  body('password').isString().notEmpty(),
];

export const verifyOtpValidator = [
  body('userId').isString().notEmpty(),
  body('otp').isString().isLength({ min: 4, max: 8 }),
];

export const completeProfileValidator = [
  body('name').optional().isString().trim(),
  body('pseudo').optional().isString().trim(),
  body('profilePic').optional().isURL(),
  body('preferredLanguage').optional().isString().isLength({ min: 2, max: 5 }),
  body('country').optional().isString().isLength({ min: 2, max: 56 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('contact').optional().isString().trim(),
];


