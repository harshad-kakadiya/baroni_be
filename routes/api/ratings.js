import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
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

// Submit review for appointment (fan only)
router.post('/appointment', requireRole('fan'), submitAppointmentReviewValidation, submitAppointmentReview);

// Submit review for dedication request (fan only)
router.post('/dedication', requireRole('fan'), submitDedicationReviewValidation, submitDedicationReview);

// Submit review for live show (fan only)
router.post('/live-show', requireRole('fan'), submitLiveShowReviewValidation, submitLiveShowReview);

// Get reviews for a specific star (public)
router.get('/star/:starId', getStarReviewsValidation, getStarReviews);

// Get current user's reviews (fans: submitted reviews, stars: received reviews)
router.get('/', getMyReviewsValidation, getMyReviews);

// Update a review
router.put('/:reviewId', updateReviewValidation, updateReview);

// Delete a review
router.delete('/:reviewId', deleteReviewValidation, deleteReview);

export default router;









