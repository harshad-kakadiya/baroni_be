import { body } from 'express-validator';

export const registerValidator = [
  // Ensure at least one identifier is provided
  body().custom((_, { req }) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    const contact = typeof req.body.contact === 'string' ? req.body.contact.trim() : '';
    if (!email && !contact) {
      throw new Error('Either a valid email or contact is required');
    }
    return true;
  }),
  body('password').optional(),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('contact').optional({ checkFalsy: true }).isString().trim(),
  body('isMobile').optional().isBoolean(),
];


export const loginValidator = [
  body('password').optional(),
  body('isMobile').optional().isBoolean(),
  body('contact').optional().isString(),
  body('email').optional().isEmail().normalizeEmail(),
];

// OTP validator removed

export const checkUserValidator = [
  body().custom((_, { req }) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    const contact = typeof req.body.contact === 'string' ? req.body.contact.trim() : '';
    if (!email && !contact) {
      throw new Error('Either email or contact is required');
    }
    return true;
  }),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body('contact').optional({ checkFalsy: true }).isString().trim(),
];

export const completeProfileValidator = [
  body('name').optional().isString().trim(),
  body('pseudo').optional().isString().trim(),
  body('profilePic').optional().custom((value) => {
    // Allow either a valid URL or skip validation (for file uploads)
    if (value === undefined || value === '') return true;
    if (typeof value === 'string') {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('profilePic must be a valid URL if provided as a string'),
  body('preferredLanguage').optional().isString(),
  body('country').optional().isString().isLength({ min: 2, max: 56 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('contact').optional().isString().trim(),
  body('about').optional().isString().trim(),
  body('location').optional().isString().trim(),
  body('profession').optional().isMongoId(),
];


