import { body } from 'express-validator';

export const registerValidator = [
  body('contact').optional().isMobilePhone().withMessage('Invalid contact number'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['fan', 'star', 'admin']).withMessage('Invalid role')
];

export const loginValidator = [
  body('contact').optional().isMobilePhone().withMessage('Invalid contact number'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('isMobile').optional().isBoolean().withMessage('isMobile must be a boolean'),
  body('password').optional().isString().withMessage('Password must be a string')
];

export const completeProfileValidator = [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('pseudo').optional().trim().isLength({ min: 3, max: 30 }).withMessage('Pseudo must be between 3 and 30 characters'),
  body('preferredLanguage').optional().trim().isLength({ max: 10 }).withMessage('Preferred language must be less than 10 characters'),
  body('country').optional().trim().isLength({ max: 50 }).withMessage('Country must be less than 50 characters'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('contact').optional().isMobilePhone().withMessage('Invalid contact number'),
  body('about').optional().trim().isLength({ max: 500 }).withMessage('About must be less than 500 characters'),
  body('location').optional().trim().isLength({ max: 100 }).withMessage('Location must be less than 100 characters'),
  body('profession').optional().isMongoId(),
  body('availableForBookings').optional().isBoolean().withMessage('availableForBookings must be a boolean value'),
  body('hidden').optional().isBoolean().withMessage('hidden must be a boolean value')
];

export const checkUserValidator = [
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('contact').optional().isMobilePhone().withMessage('Invalid contact number')
];

export const deleteAccountValidator = [
  body('password')
    .optional()
    .isString()
    .withMessage('Password must be a string'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be a string with maximum 500 characters')
];


