import User from "../models/User.js";
import mongoose from "mongoose";
import Dedication from "../models/Dedication.js";
import DedicationSample from "../models/DedicationSample.js";
import Service from "../models/Service.js";
import Availability from "../models/Availability.js";

export const getAllStars = async (req, res) => {
    try {
        const stars = await User.find({ role: "star" }).select(
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
        } else {
            // For non-fans or unauthenticated users, set isFavorite to false
            starData.isFavorite = false;
        }

        // fetch related data
        const [dedications, services, dedicationSamples, availability] = await Promise.all([
            Dedication.find({ userId: id }),
            Service.find({ userId: id }),
            DedicationSample.find({ userId: id }),
            Availability.find({ userId: id }),
        ]);

        res.status(200).json({
            success: true,
            data: {
                star: starData,
                dedications,
                services,
                dedicationSamples,
                availability,
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