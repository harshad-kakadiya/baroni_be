import { body, validationResult } from "express-validator";
import User from "../models/User.js";
import { handleValidationErrors } from '../utils/validationHelper.js';

export const storeMessageValidator = [
    body("conversationId")
        .optional()
        .isString()
        .withMessage("conversationId must be a string"),

    body("receiverId")
        .optional()
        .isString()
        .withMessage("receiverId must be a string when creating new conversation"),

    body("message")
        .optional()
        .isString()
        .withMessage("Message must be a string"),

    body("type")
        .optional()
        .isIn(["text", "image", "video", "file"])
        .withMessage("type must be one of: text, image, video, file"),

    // Custom validation middleware to check conversation rules
    async (req, res, next) => {
        try {
            const { receiverId, message } = req.body;
            const senderId = req.user && req.user._id ? req.user._id : null;
            const file = req.file;

            if (!senderId) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Unauthorized' 
                });
            }

            // Check if either message or image is provided
            if (!message && !file) {
                return res.status(400).json({
                    success: false,
                    message: 'Either message content or image is required'
                });
            }

            // If receiverId is provided (creating new conversation)
            if (receiverId) {
                // Check if user is trying to message themselves
                if (String(senderId) === String(receiverId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'You cannot start a conversation with yourself'
                    });
                }

                // Get sender and receiver user details
                const [sender, receiver] = await Promise.all([
                    User.findById(senderId).select('role'),
                    User.findById(receiverId).select('role')
                ]);

                if (!sender || !receiver) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid sender or receiver'
                    });
                }

                // Enforce messaging: only fan can initiate to star; block others
                if (!(sender.role === 'fan' && receiver.role === 'star')) {
                    return res.status(400).json({
                        success: false,
                        message: 'Only fans can initiate conversations with stars'
                    });
                }
            }

            next();
        } catch (error) {
            console.error('Validation error:', error);
            return res.status(500).json({
                success: false,
                message: 'Validation error occurred',
                error: error.message
            });
        }
    },

    // Middleware to check validation results
    handleValidationErrors,
];
