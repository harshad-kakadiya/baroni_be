import express from 'express';
import { body } from 'express-validator';
import { 
  handlePaymentCallback, 
  handlePaymentTimeout 
} from '../../controllers/paymentCallback.js';

const router = express.Router();

// Validation middleware for payment callback
const validatePaymentCallback = [
  body('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required'),
  body('status')
    .isIn(['OK', 'KO'])
    .withMessage('Status must be OK or KO'),
  body('montant')
    .isNumeric()
    .withMessage('Amount must be numeric'),
  body('motif')
    .optional()
    .isString()
    .withMessage('Motif must be a string')
];

// Payment callback endpoint (no auth required - called by Orange Money)
router.post('/callback', validatePaymentCallback, handlePaymentCallback);

// Payment timeout handler (for cron jobs)
router.post('/timeout', handlePaymentTimeout);

export default router;

