import { body, param, query } from 'express-validator';

// Validation for creating a transaction
export const createTransactionValidator = [
  body('type')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Transaction type must be between 2 and 50 characters'),
  body('receiverId')
    .isMongoId()
    .withMessage('Invalid receiver ID'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number greater than 0'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('paymentMode')
    .isIn(['coin', 'external'])
    .withMessage('Payment mode must be either "coin" or "external"'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

// Validation for getting transaction by ID
export const getTransactionValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid transaction ID')
];

// Validation for getting user transactions
export const getUserTransactionsValidator = [
  query('type')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Transaction type must be between 2 and 50 characters'),
  query('paymentMode')
    .optional()
    .isIn(['coin', 'external'])
    .withMessage('Payment mode must be either "coin" or "external"')
];
