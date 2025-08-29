import { body, validationResult } from "express-validator";

exports.storeMessageValidator = [
    body("channelName")
        .notEmpty()
        .withMessage("Channel name is required")
        .isString()
        .withMessage("Channel name must be a string"),

    body("senderId")
        .notEmpty()
        .withMessage("Sender ID is required")
        .isString()
        .withMessage("Sender ID must be a string"),

    body("receiverId")
        .optional()
        .isString()
        .withMessage("Receiver ID must be a string"),

    body("message")
        .notEmpty()
        .withMessage("Message content is required")
        .isString()
        .withMessage("Message must be a string"),

    body("messageType")
        .optional()
        .isIn(["text", "image", "video", "file"])
        .withMessage("Message type must be one of: text, image, video, file"),

    body("timestamp")
        .optional()
        .isISO8601()
        .withMessage("Timestamp must be a valid ISO8601 date"),

    // Middleware to check validation results
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    },
];
