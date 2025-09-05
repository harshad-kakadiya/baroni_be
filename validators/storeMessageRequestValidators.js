import { body, validationResult } from "express-validator";

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

    // Middleware to check validation results
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    },
];
