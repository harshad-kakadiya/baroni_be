import express from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  submitAppointmentReview,
  submitDedicationReview,
  submitLiveShowReview,
  getStarReviews,
  getMyReviews,
  updateReview,
  deleteReview
} from '../../controllers/rating.js';
import {
  submitAppointmentReviewValidation,
  submitDedicationReviewValidation,
  submitLiveShowReviewValidation,
  getStarReviewsValidation,
  getMyReviewsValidation,
  updateReviewValidation,
  deleteReviewValidation
} from '../../validators/ratingValidators.js';

const router = express.Router();

router.use(requireAuth);

// Submit review for appointment
router.post('/appointment', submitAppointmentReviewValidation, submitAppointmentReview);

// Submit review for dedication request
router.post('/dedication', submitDedicationReviewValidation, submitDedicationReview);

// Submit review for live show
router.post('/live-show', submitLiveShowReviewValidation, submitLiveShowReview);

// Get reviews for a specific star (public)
router.get('/star/:starId', getStarReviewsValidation, getStarReviews);

// Get current user's reviews
router.get('/my-reviews', getMyReviewsValidation, getMyReviews);

// Update a review
router.put('/:reviewId', updateReviewValidation, updateReview);

// Delete a review
router.delete('/:reviewId', deleteReviewValidation, deleteReview);

export default router;
