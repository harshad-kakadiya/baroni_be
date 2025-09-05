import { body, validationResult } from "express-validator";
import User from "../models/User.js";

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
        .notEmpty()
        .withMessage("Message content is required")
        .isString()
        .withMessage("Message must be a string"),

    body("type")
        .optional()
        .isIn(["text", "image", "video", "file"])
        .withMessage("type must be one of: text, image, video, file"),

    // Custom validation middleware to check conversation rules
    async (req, res, next) => {
        try {
            const { receiverId } = req.body;
            const senderId = req.user && req.user._id ? req.user._id : null;

            if (!senderId) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Unauthorized' 
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

                // Check if both users are fans (not allowed)
                if (sender.role === 'fan' && receiver.role === 'fan') {
                    return res.status(400).json({
                        success: false,
                        message: 'Fans cannot start conversations with other fans'
                    });
                }

                // Check if both users are stars (not allowed)
                if (sender.role === 'star' && receiver.role === 'star') {
                    return res.status(400).json({
                        success: false,
                        message: 'Stars cannot start conversations with other stars'
                    });
                }

                // Check if both users are admins (not allowed)
                if (sender.role === 'admin' && receiver.role === 'admin') {
                    return res.status(400).json({
                        success: false,
                        message: 'Admins cannot start conversations with other admins'
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
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    },
];
