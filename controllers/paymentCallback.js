import { validationResult } from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import { 
  processPaymentCallback, 
  handlePaymentTimeout as processPaymentTimeout
} from '../services/paymentCallbackService.js';

/**
 * Handle Orange Money payment callback
 * POST /api/payment/callback
 */
export const handlePaymentCallback = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ 
        success: false, 
        message: errorMessage || 'Invalid callback data'
      });
    }

    const callbackData = req.body;
    const result = await processPaymentCallback(callbackData);

    return res.status(200).json({
      success: true,
      message: 'Payment callback processed successfully',
      data: result
    });
  } catch (err) {
    console.error('Error processing payment callback:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error processing payment callback',
      error: err.message 
    });
  }
};

/**
 * Handle payment timeout and refund
 * This endpoint can be called by a cron job or scheduler
 * POST /api/payment/timeout
 */
export const handlePaymentTimeout = async (req, res) => {
  try {
    const result = await processPaymentTimeout();
    
    return res.status(200).json({
      success: true,
      message: 'Payment timeout check completed',
      data: result
    });
  } catch (err) {
    console.error('Error handling payment timeout:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error handling payment timeout',
      error: err.message 
    });
  }
};
