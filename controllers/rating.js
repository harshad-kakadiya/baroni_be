import { validationResult } from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import DedicationRequest from '../models/DedicationRequest.js';
import LiveShow from '../models/LiveShow.js';
import mongoose from 'mongoose';

// Helper function to calculate and update star's average rating
const updateStarRating = async (starId) => {
  try {
    const reviews = await Review.find({ 
      starId
    });
    
    if (reviews.length === 0) {
      await User.findByIdAndUpdate(starId, {
        averageRating: 0,
        totalReviews: 0
      });
      return;
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;
    
    await User.findByIdAndUpdate(starId, {
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      totalReviews: reviews.length
    });
  } catch (error) {
    console.error('Error updating star rating:', error);
  }
};

// Submit a review for an appointment
export const submitAppointmentReview = async (req, res) => {
  try {
    // Only fans can submit reviews
    if (req.user.role !== 'fan') {
      return res.status(403).json({ success: false, message: 'Only fans can submit reviews' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { appointmentId, rating, comment } = req.body;

    // Validate appointment exists and is completed
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      fanId: req.user._id,
      status: 'completed'
    });

    if (!appointment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Completed appointment not found' 
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      reviewerId: req.user._id,
      appointmentId: appointmentId
    });

    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'Review already submitted for this appointment' 
      });
    }

    // Create review
    const review = await Review.create({
      reviewerId: req.user._id,
      starId: appointment.starId,
      rating,
      comment: comment?.trim(),
      appointmentId: appointmentId,
      reviewType: 'appointment'
    });

    // Update star's average rating
    await updateStarRating(appointment.starId);

    // Populate reviewer info for response
    await review.populate('reviewerId', 'name pseudo profilePic agoraKey');

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        reviewer: {
          id: review.reviewerId._id,
          name: review.reviewerId.name,
          pseudo: review.reviewerId.pseudo,
          profilePic: review.reviewerId.profilePic
        },
        createdAt: review.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Submit a review for a dedication request
export const submitDedicationReview = async (req, res) => {
  try {
    // Only fans can submit reviews
    if (req.user.role !== 'fan') {
      return res.status(403).json({ success: false, message: 'Only fans can submit reviews' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { dedicationRequestId, rating, comment } = req.body;

    // Validate dedication request exists and is completed
    const dedicationRequest = await DedicationRequest.findOne({
      _id: dedicationRequestId,
      fanId: req.user._id,
      status: 'completed'
    });

    if (!dedicationRequest) {
      return res.status(404).json({ 
        success: false, 
        message: 'Completed dedication request not found' 
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      reviewerId: req.user._id,
      dedicationRequestId: dedicationRequestId
    });

    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'Review already submitted for this dedication request' 
      });
    }

    // Create review
    const review = await Review.create({
      reviewerId: req.user._id,
      starId: dedicationRequest.starId,
      rating,
      comment: comment?.trim(),
      dedicationRequestId: dedicationRequestId,
      reviewType: 'dedication'
    });

    // Update star's average rating
    await updateStarRating(dedicationRequest.starId);

    // Populate reviewer info for response
    await review.populate('reviewerId', 'name pseudo profilePic agoraKey');

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        reviewer: {
          id: review.reviewerId._id,
          name: review.reviewerId.name,
          pseudo: review.reviewerId.pseudo,
          profilePic: review.reviewerId.profilePic
        },
        createdAt: review.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Submit a review for a live show
export const submitLiveShowReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { liveShowId, rating, comment } = req.body;

    // Validate live show exists, user attended it, and it is completed
    const liveShow = await LiveShow.findOne({
      _id: liveShowId,
      attendees: req.user._id,
      status: 'completed'
    });

    if (!liveShow) {
      return res.status(404).json({ 
        success: false, 
        message: 'Live show not found, not completed, or you did not attend this show' 
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      reviewerId: req.user._id,
      liveShowId: liveShowId
    });

    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'Review already submitted for this live show' 
      });
    }

    // Create review
    const review = await Review.create({
      reviewerId: req.user._id,
      starId: liveShow.starId,
      rating,
      comment: comment?.trim(),
      liveShowId: liveShowId,
      reviewType: 'live_show'
    });

    // Update star's average rating
    await updateStarRating(liveShow.starId);

    // Populate reviewer info for response
    await review.populate('reviewerId', 'name pseudo profilePic agoraKey');

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        reviewer: {
          id: review.reviewerId._id,
          name: review.reviewerId.name,
          pseudo: review.reviewerId.pseudo,
          profilePic: review.reviewerId.profilePic
        },
        createdAt: review.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get reviews for a specific star
export const getStarReviews = async (req, res) => {
  try {
    const { starId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(starId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid star ID' 
      });
    }

    const reviews = await Review.find({ 
      starId
    })
    .populate('reviewerId', 'name pseudo profilePic agoraKey')
    .sort({ createdAt: -1 });

    const star = await User.findById(starId).select('averageRating totalReviews');

    return res.json({
      success: true,
      data: {
        reviews: reviews.map(review => ({
          id: review._id,
          rating: review.rating,
          comment: review.comment,
          reviewer: {
            id: review.reviewerId._id,
            name: review.reviewerId.name,
            pseudo: review.reviewerId.pseudo,
            profilePic: review.reviewerId.profilePic
          },
          reviewType: review.reviewType,
          createdAt: review.createdAt
        })),
        star: {
          averageRating: star?.averageRating || 0,
          totalReviews: reviews.length
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get user's submitted reviews
export const getMyReviews = async (req, res) => {
  try {
    // If the requester is a star, return all reviews received for the star
    // If the requester is a fan, return reviews submitted by the fan
    const isStar = req.user.role === 'star';
    const filter = isStar ? { starId: req.user._id } : { reviewerId: req.user._id };

    const reviews = await Review.find(filter)
      .populate(isStar ? 'reviewerId' : 'starId', 'name pseudo profilePic agoraKey')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: {
        reviews: reviews.map(review => ({
          id: review._id,
          rating: review.rating,
          comment: review.comment,
          // If star is requesting, include reviewer details; otherwise include star details
          ...(isStar
            ? {
                reviewer: {
                  id: review.reviewerId._id,
                  name: review.reviewerId.name,
                  pseudo: review.reviewerId.pseudo,
                  profilePic: review.reviewerId.profilePic
                }
              }
            : {
                star: {
                  id: review.starId._id,
                  name: review.starId.name,
                  pseudo: review.starId.pseudo,
                  profilePic: review.starId.profilePic
                }
              }),
          reviewType: review.reviewType,
          createdAt: review.createdAt
        }))
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Update a review (only by the reviewer)
export const updateReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    const review = await Review.findOne({
      _id: reviewId,
      reviewerId: req.user._id
    });

    if (!review) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review not found' 
      });
    }

    // Update review
    review.rating = rating;
    review.comment = comment?.trim();
    await review.save();

    // Update star's average rating
    await updateStarRating(review.starId);

    return res.json({
      success: true,
      message: 'Review updated successfully',
      data: {
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        updatedAt: review.updatedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Delete a review (only by the reviewer)
export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findOne({
      _id: reviewId,
      reviewerId: req.user._id
    });

    if (!review) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review not found' 
      });
    }

    const starId = review.starId;
    await Review.findByIdAndDelete(reviewId);

    // Update star's average rating
    await updateStarRating(starId);

    return res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};







