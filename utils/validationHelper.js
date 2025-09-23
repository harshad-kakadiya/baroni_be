import { validationResult } from 'express-validator';

/**
 * Get the first validation error message from validationResult
 * @param {Object} validationResult - The result from express-validator
 * @returns {string|null} - The first error message or null if no errors
 */
export const getFirstValidationError = (validationResult) => {
  if (!validationResult || validationResult.isEmpty()) {
    return null;
  }
  
  const errors = validationResult.array();
  return errors.length > 0 ? errors[0].msg : null;
};

/**
 * Middleware to handle validation errors and return single error message
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Object|void} - Response with error or calls next()
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessage = getFirstValidationError(errors);
    return res.status(400).json({ 
      success: false, 
      message: errorMessage || 'Validation failed'
    });
  }
  next();
};
