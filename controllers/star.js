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
import { generateUniqueGoldBaroniId } from "../utils/baroniIdGenerator.js";

/**
 * Fan pays to become a Star (Standard or Gold)
 * Body: { plan: 'standard' | 'gold', amount: number, paymentMode: 'coin' | 'external', paymentDescription? }
 * - If plan is 'standard': keep existing baroniId
 * - If plan is 'gold': assign a unique GOLD patterned baroniId
 * - Transaction is created with receiver = admin (first admin user)
 * - On success, user role becomes 'star'
 */
export const becomeStar = async (req, res) => {
    try {
        const { plan, amount, paymentMode = 'coin', paymentDescription } = req.body;

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

        // If Gold, generate a new GOLD-formatted unique baroniId
        let updates = { role: 'star' };
        if (String(plan) === 'gold') {
            const newGoldId = await generateUniqueGoldBaroniId();
            updates.baroniId = newGoldId;
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
        const filter = { role: "star" };
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

        // Check if user is authenticated and is a fan to add favorite status
        let starsData = stars.map(star => star.toObject());

        if (req.user && req.user.role === 'fan') {
            const fan = req.user;
            starsData = starsData.map(star => ({
                ...star,
                isFavorite: fan.favorites.includes(star._id)
            }));
        } else {
            // For non-fans or unauthenticated users, set isFavorite to false
            starsData = starsData.map(star => ({
                ...star,
                isFavorite: false
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

        // fetch star basic info
        const star = await User.findOne({ _id: id, role: "star" }).select(
            "-password -passwordResetToken -passwordResetExpires"
        );

        if (!star) {
            return res.status(404).json({
                success: false,
                message: "Star not found",
            });
        }

        // Check if user is authenticated and is a fan to add favorite status
        let starData = star.toObject();

        if (req.user && req.user.role === 'fan') {
            const fan = req.user;
            starData.isFavorite = fan.favorites.includes(id);
            const [hasActiveAppointment, hasActiveDedication] = await Promise.all([
                Appointment.exists({ starId: id, fanId: fan._id, status: { $in: ['pending', 'approved'] } }),
                DedicationRequest.exists({ starId: id, fanId: fan._id, status: { $in: ['pending', 'approved'] } })
            ]);
            starData.isMessage = Boolean(hasActiveAppointment || hasActiveDedication);
        } else {
            // For non-fans or unauthenticated users, set isFavorite to false
            starData.isFavorite = false;
            starData.isMessage = false;
        }

        // fetch related data including upcoming live shows
        const [dedications, services, dedicationSamples, availability, upcomingShows] = await Promise.all([
            Dedication.find({ userId: id }),
            Service.find({ userId: id }),
            DedicationSample.find({ userId: id }),
            Availability.find({ userId: id }),
            LiveShow.find({
                starId: id,
                date: { $gt: new Date() },
                status: 'scheduled'
            })
            .sort({ date: 1 })
            .limit(10)
        ]);

        res.status(200).json({
            success: true,
            data: {
                star: starData,
                dedications,
                services,
                dedicationSamples,
                availability,
                upcomingShows: upcomingShows.map(show => ({
                    id: show._id,
                    sessionTitle: show.sessionTitle,
                    date: show.date,
                    time: show.time,
                    attendanceFee: show.attendanceFee,
                    hostingPrice: show.hostingPrice,
                    maxCapacity: show.maxCapacity,
                    showCode: show.showCode,
                    inviteLink: show.inviteLink,
                    currentAttendees: show.currentAttendees,
                    status: show.status,
                    description: show.description,
                    thumbnail: show.thumbnail,
                    likeCount: Array.isArray(show.likes) ? show.likes.length : 0,
                    isLiked: Array.isArray(show.likes) && show.likes.some(u => u.toString() === req.user._id.toString())
                }))
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error while fetching star",
            error: error.message,
        });
    }
};