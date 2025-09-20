import { query, validationResult } from 'express-validator';

export const analyticsDateValidator = [
    query('startDate')
        .optional()
        .isISO8601()
        .withMessage('startDate must be a valid ISO 8601 date (YYYY-MM-DD)')
        .custom((value) => {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid startDate format');
            }
            return true;
        }),

    query('endDate')
        .optional()
        .isISO8601()
        .withMessage('endDate must be a valid ISO 8601 date (YYYY-MM-DD)')
        .custom((value) => {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid endDate format');
            }
            return true;
        }),

    // Custom validation to ensure endDate is after startDate
    query().custom((queryParams) => {
        const { startDate, endDate } = queryParams;
        
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            if (start > end) {
                throw new Error('endDate must be after startDate');
            }
            
            // Check if date range is not too large (e.g., more than 2 years)
            const diffInDays = (end - start) / (1000 * 60 * 60 * 24);
            if (diffInDays > 730) { // 2 years
                throw new Error('Date range cannot exceed 2 years');
            }
        }
        
        return true;
    }),

    // Middleware to check validation results
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array() 
            });
        }
        next();
    },
];
