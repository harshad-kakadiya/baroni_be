import User from "../models/User.js";
import mongoose from "mongoose";
import Dedication from "../models/Dedication.js";
import DedicationSample from "../models/DedicationSample.js";
import Service from "../models/Service.js";
import Availability from "../models/Availability.js";
import LiveShow from "../models/LiveShow.js";
import LiveShowAttendance from "../models/LiveShowAttendance.js";
import Appointment from "../models/Appointment.js";
import DedicationRequest from "../models/DedicationRequest.js";
import Transaction from "../models/Transaction.js";
import { createTransaction, completeTransaction } from "../services/transactionService.js";
import { TRANSACTION_DESCRIPTIONS, TRANSACTION_TYPES } from "../utils/transactionConstants.js";
import { generateUniqueGoldBaroniId, generateUniqueBaroniId } from "../utils/baroniIdGenerator.js";
import Review from "../models/Review.js";

/**
 * Get available baroni ID patterns for becoming a star
 * Returns standard and gold baroni ID patterns that the user can choose from
 */
export const getBaroniIdPatterns = async (req, res) => {
    try {
        // Generate a standard baroni ID pattern
        const standardId = await generateUniqueBaroniId();
        
        // Generate a gold baroni ID pattern
        const goldId = await generateUniqueGoldBaroniId();
        
        return res.status(200).json({
            success: true,
            data: {
                standard: {
                    pattern: standardId,
                    description: "Standard 6-digit baroni ID"
                },
                gold: {
                    pattern: goldId,
                    description: "Gold baroni ID with special pattern (AAAAAA or ABABAB)"
                }
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * Fan pays to become a Star (Standard or Gold)
 * Body: { plan: 'standard' | 'gold', amount: number, paymentMode: 'coin' | 'external', paymentDescription?, baroniId? }
 * - If plan is 'standard': use provided baroniId or keep existing baroniId
 * - If plan is 'gold': use provided baroniId or assign a unique GOLD patterned baroniId
 * - Transaction is created with receiver = admin (first admin user)
 * - On success, user role becomes 'star'
 */
export const becomeStar = async (req, res) => {
    try {
        const { plan, amount, paymentMode = 'coin', paymentDescription, baroniId } = req.body;

        if (req.user.role !== 'fan') {
            return res.status(403).json({ success: false, message: 'Only fans can become stars' });
        }

        if (!['standard', 'gold'].includes(String(plan))) {
            return res.status(400).json({ success: false, message: 'Invalid plan. Use standard or gold' });
        }

        // Check for pending commitments - fan must complete or cancel all before becoming star
        const userId = req.user._id;
        
        const [pendingDedications, pendingAppointments, pendingLiveShows] = await Promise.all([
            // Check for pending or approved dedication requests where user is the fan
            DedicationRequest.countDocuments({
                fanId: userId,
                status: { $in: ['pending', 'approved'] }
            }),
            
            // Check for pending or approved appointments where user is the fan
            Appointment.countDocuments({
                fanId: userId,
                status: { $in: ['pending', 'approved'] }
            }),
            
            // Check for pending live show attendances where user is the fan
            LiveShowAttendance.countDocuments({
                fanId: userId,
                status: { $in: ['pending', 'approved'] }
            })
        ]);

        const totalPendingCommitments = pendingDedications + pendingAppointments + pendingLiveShows;

        if (totalPendingCommitments > 0) {
            const commitmentDetails = [];
            if (pendingDedications > 0) commitmentDetails.push(`${pendingDedications} dedication request(s)`);
            if (pendingAppointments > 0) commitmentDetails.push(`${pendingAppointments} appointment(s)`);
            if (pendingLiveShows > 0) commitmentDetails.push(`${pendingLiveShows} live show attendance(s)`);

            return res.status(400).json({
                success: false,
                message: `You have ${totalPendingCommitments} pending commitment(s) that must be completed or cancelled before becoming a star: ${commitmentDetails.join(', ')}. Please complete or cancel all your pending commitments first.`
            });
        }

        const numericAmount = Number(amount);
        if (!numericAmount || numericAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        // Validate baroniId if provided
        if (baroniId) {
            // Check if the provided baroniId already exists
            const existingUser = await User.findOne({ baroniId: String(baroniId) });
            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Baroni ID already exists, please try again' 
                });
            }
        }

        // Find an admin user to receive the payment
        const adminUser = await User.findOne({ role: 'admin' });
        if (!adminUser) {
            return res.status(500).json({ success: false, message: 'Admin account not configured' });
        }

        // Create a pending transaction from fan to admin
        try {
            await createTransaction({
                type: TRANSACTION_TYPES.BECOME_STAR_PAYMENT,
                payerId: req.user._id,
                receiverId: adminUser._id,
                amount: numericAmount,
                description: paymentMode === 'external' && paymentDescription ? String(paymentDescription) : TRANSACTION_DESCRIPTIONS[TRANSACTION_TYPES.BECOME_STAR_PAYMENT],
                paymentMode,
                metadata: { plan }
            });
        } catch (transactionError) {
            return res.status(400).json({ success: false, message: 'Transaction failed: ' + transactionError.message });
        }

        // Retrieve the transaction to complete it immediately (since this endpoint models successful payment)
        const transaction = await Transaction.findOne({
            payerId: req.user._id,
            receiverId: adminUser._id,
            type: TRANSACTION_TYPES.BECOME_STAR_PAYMENT,
            status: 'pending'
        }).sort({ createdAt: -1 });

        if (!transaction) {
            return res.status(500).json({ success: false, message: 'Failed to retrieve transaction' });
        }

        // Complete the transaction (credit admin wallet for coin mode, mark completed for external)
        await completeTransaction(transaction._id);

        // Handle baroniId assignment on becoming a star
        let updates = { role: 'star' };

        // Always assign a baroniId when promoting to star
        if (String(plan) === 'gold') {
            const newGoldId = await generateUniqueGoldBaroniId();
            updates.baroniId = newGoldId;
        } else {
            const newId = await generateUniqueBaroniId();
            updates.baroniId = newId;
        }

        const updatedUser = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });

        return res.status(200).json({
            success: true,
            message: 'You are now a Baroni Star',
            data: {
                user: {
                    id: updatedUser._id,
                    baroniId: updatedUser.baroniId,
                    role: updatedUser.role
                },
                transactionId: transaction._id,
                plan
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const getAllStars = async (req, res) => {
    try {
        const { q, country } = req.query;
        const filter = {
            role: "star",
            hidden: { $ne: true }, // Exclude hidden stars from general search
            // Only include stars that have filled up their details
            $and: [
                { name: { $exists: true, $ne: null } },
                { name: { $ne: '' } },
                { pseudo: { $exists: true, $ne: null } },
                { pseudo: { $ne: '' } },
                { about: { $exists: true, $ne: null } },
                { about: { $ne: '' } },
                { location: { $exists: true, $ne: null } },
                { location: { $ne: '' } },
                { profession: { $exists: true, $ne: null } }
            ]
        };
        if (country) {
            filter.country = country;
        }
        if (q && q.trim()) {
            const regex = new RegExp(q.trim(), "i");
            const searchQuery = [{ name: regex }, { pseudo: regex }];
            
            // Check if the search query looks like a baroniId (6 digits)
            if (/^\d{6}$/.test(q.trim())) {
                // For baroniId search, also include hidden stars
                const baroniIdFilter = {
                    role: "star",
                    baroniId: q.trim(),
                    // Only include stars that have filled up their details
                    $and: [
                        { name: { $exists: true, $ne: null } },
                        { name: { $ne: '' } },
                        { pseudo: { $exists: true, $ne: null } },
                        { pseudo: { $ne: '' } },
                        { about: { $exists: true, $ne: null } },
                        { about: { $ne: '' } },
                        { location: { $exists: true, $ne: null } },
                        { location: { $ne: '' } },
                        { profession: { $exists: true, $ne: null } }
                    ]
                };
                if (country) {
                    baroniIdFilter.country = country;
                }
                
                const stars = await User.find(baroniIdFilter).select(
                    "-password -passwordResetToken -passwordResetExpires"
                );
                
                // Check if user is authenticated to add favorite/liked status
                let starsData = stars.map(star => star.toObject());

                if (req.user) {
                    // Check if each star is in user's favorites
                    starsData = starsData.map(star => ({
                        ...star,
                        isLiked: req.user.favorites.includes(star._id)
                    }));
                } else {
                    // For unauthenticated users, set isLiked to false
                    starsData = starsData.map(star => ({
                        ...star,
                        isLiked: false
                    }));
                }

                return res.status(200).json({
                    success: true,
                    data: starsData,
                });
            }
            
            filter.$or = searchQuery;
        }

        const stars = await User.find(filter).select(
            "-password -passwordResetToken -passwordResetExpires"
        );

        // if no stars found
        if (!stars || stars.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No stars found",
            });
        }

        // Check if user is authenticated to add favorite/liked status
        let starsData = stars.map(star => star.toObject());

        if (req.user) {
            // Check if each star is in user's favorites
            starsData = starsData.map(star => ({
                ...star,
                isLiked: req.user.favorites.includes(star._id)
            }));
        } else {
            // For unauthenticated users, set isLiked to false
            starsData = starsData.map(star => ({
                ...star,
                isLiked: false
            }));
        }

        res.status(200).json({
            success: true,
            count: starsData.length,
            data: starsData,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error while fetching stars",
            error: error.message,
        });
    }
};

export const getStarById = async (req, res) => {
    try {
        const { id } = req.params;

        // validate id
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        // fetch star basic info with details check
        const star = await User.findOne({
            _id: id,
            role: "star"}).select(
            "-password -passwordResetToken -passwordResetExpires"
        );

        if (!star) {
            return res.status(404).json({
                success: false,
                message: "Star not found or profile incomplete",
            });
        }

        // Increment profile impressions count for this star
        await User.findByIdAndUpdate(id, { $inc: { profileImpressions: 1 } });

        // Check if user is authenticated to add favorite/liked status
        let starData = star.toObject();

        if (req.user) {
            // Check if the star is in user's favorites
            starData.isLiked = Array.isArray(req.user.favorites) && req.user.favorites.map(String).includes(String(id));

            // Additional fan-specific checks
            if (req.user.role === 'fan') {
                const [hasActiveAppointment, hasActiveDedication] = await Promise.all([
                    Appointment.exists({ starId: id, fanId: req.user._id, status: { $in: ['pending', 'approved'] } }),
                    DedicationRequest.exists({ starId: id, fanId: req.user._id, status: { $in: ['pending', 'approved'] } })
                ]);
                starData.isMessage = Boolean(hasActiveAppointment || hasActiveDedication);
            } else {
                starData.isMessage = false;
            }
        } else {
            // For unauthenticated users, set isLiked to false
            starData.isLiked = false;
            starData.isMessage = false;
        }

        // fetch related data including upcoming live shows
        const [dedications, services, dedicationSamples, availability, upcomingShows] = await Promise.all([
            Dedication.find({ userId: id }),
            Service.find({ userId: id }),
            DedicationSample.find({ userId: id }),
            Availability.find({
                userId: id,
                date: { $gte: new Date().toISOString().split('T')[0] } // Only current and future availabilities (YYYY-MM-DD format)
            }).sort({ date: 1 }),
            LiveShow.find({
                starId: id,
                date: { $gt: new Date() },
                status: 'pending'
            })
                .sort({ date: 1 })
                .limit(10)
        ]);

        // compute average rating and total reviews for the star
        const ratingAgg = await Review.aggregate([
            { $match: { starId: new mongoose.Types.ObjectId(id) } },
            { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);
        const avg = ratingAgg && ratingAgg.length ? Math.round((ratingAgg[0].avg || 0) * 10) / 10 : 0;
        const count = ratingAgg && ratingAgg.length ? ratingAgg[0].count : 0;
        starData.averageRating = avg;
        starData.totalReviews = count;

        // fetch latest 5 reviews for this star
        const latestReviews = await Review.find({ starId: id })
            .populate('reviewerId', 'name pseudo profilePic')
            .sort({ createdAt: -1 })
            .limit(5);

        // Build unified allservices array (dedications + services)
        const allservices = [
            ...dedications.map(d => ({ ...d.toObject(), itemType: 'dedication' })),
            ...services.map(s => ({ ...s.toObject(), itemType: 'service' }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Add isLiked field to each upcoming show
        const upcomingShowsWithLikeStatus = upcomingShows.map(show => {
            const showData = show.toObject();
            if (req.user) {
                // Check if the current user has liked this show
                showData.isLiked = Array.isArray(show.likes) && show.likes.some(likeId =>
                    likeId.toString() === req.user._id.toString()
                );
            } else {
                showData.isLiked = false;
            }
            return showData;
        });

        // Filter out unavailable (booked) time slots from availability
        const filteredAvailability = Array.isArray(availability)
            ? availability
                .map((doc) => {
                    const item = typeof doc.toObject === 'function' ? doc.toObject() : doc;
                    const timeSlots = Array.isArray(item.timeSlots)
                        ? item.timeSlots.filter((s) => s && s.status === 'available')
                        : [];
                    return { ...item, timeSlots };
                })
                .filter((item) => Array.isArray(item.timeSlots) && item.timeSlots.length > 0)
            : [];

        res.status(200).json({
            success: true,
            data: {
                star: starData,
                allservices,
                dedicationSamples,
                availability: filteredAvailability,
                upcomingShows: upcomingShowsWithLikeStatus,
                latestReviews: latestReviews.map(r => ({
                    id: r._id,
                    rating: r.rating,
                    comment: r.comment,
                    reviewer: r.reviewerId ? {
                        id: r.reviewerId._id,
                        name: r.reviewerId.name,
                        pseudo: r.reviewerId.pseudo,
                        profilePic: r.reviewerId.profilePic,
                    } : null,
                    reviewType: r.reviewType,
                    createdAt: r.createdAt,
                }))
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error while fetching star details",
            error: error.message,
        });
    }
};