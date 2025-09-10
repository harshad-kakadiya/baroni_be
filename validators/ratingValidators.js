import { body, param, query } from 'express-validator';

// Common rating validation
const ratingValidation = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment must be less than 500 characters')
];

// Appointment review validation
export const submitAppointmentReviewValidation = [
  body('appointmentId')
    .isMongoId()
    .withMessage('Valid appointment ID is required'),
  ...ratingValidation
];

// Dedication review validation
export const submitDedicationReviewValidation = [
  body('dedicationRequestId')
    .isMongoId()
    .withMessage('Valid dedication request ID is required'),
  ...ratingValidation
];

// Live show review validation
export const submitLiveShowReviewValidation = [
  body('liveShowId')
    .isMongoId()
    .withMessage('Valid live show ID is required'),
  ...ratingValidation
];

// Update review validation
export const updateReviewValidation = [
  param('reviewId')
    .isMongoId()
    .withMessage('Valid review ID is required'),
  ...ratingValidation
];

// Get star reviews validation
export const getStarReviewsValidation = [
  param('starId')
    .isMongoId()
    .withMessage('Valid star ID is required'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

// Get my reviews validation
export const getMyReviewsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

// Delete review validation
export const deleteReviewValidation = [
  param('reviewId')
    .isMongoId()
    .withMessage('Valid review ID is required')
];

