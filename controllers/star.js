import User from "../models/User.js";
import mongoose from "mongoose";
import Dedication from "../models/Dedication.js";
import DedicationSample from "../models/DedicationSample.js";
import Service from "../models/Service.js";
import Availability from "../models/Availability.js";
import LiveShow from "../models/LiveShow.js";
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
                    description: "Standard 5-digit baroni ID"
                },
                gold: {
                    pattern: goldId,
                    description: "Gold baroni ID with special pattern (AAAAA or ABABA)"
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

        // Handle baroniId assignment based on plan and provided baroniId
        let updates = { role: 'star' };
        
        if (baroniId) {
            // Use the provided baroniId
            updates.baroniId = String(baroniId);
        } else if (String(plan) === 'gold') {
            // Generate a new GOLD-formatted unique baroniId if no baroniId provided
            const newGoldId = await generateUniqueGoldBaroniId();
            updates.baroniId = newGoldId;
        }
        // For standard plan without baroniId, keep existing baroniId (no update needed)

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
            filter.$or = [{ name: regex }, { pseudo: regex }];
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

        // Check if user is authenticated to add favorite/liked status
        let starData = star.toObject();

        if (req.user) {
            // Check if the star is in user's favorites
            starData.isLiked = req.user.favorites.includes(id);

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

        res.status(200).json({
            success: true,
            data: {
                star: starData,
                allservices,
                dedicationSamples,
                availability,
                upcomingShows: upcomingShowsWithLikeStatus,
                latestReviews: latestReviews.map(r => ({
                    id: r._id,
                    rating: r.rating,
                    comment: r.comment,
                    reviewer: {
                        id: r.reviewerId._id,
                        name: r.reviewerId.name,
                        pseudo: r.reviewerId.pseudo,
                        profilePic: r.reviewerId.profilePic,
                    },
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