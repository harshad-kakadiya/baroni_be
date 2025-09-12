import { body } from 'express-validator';

export const upsertConfigValidation = [
  body('liveShowPriceHide')
    .optional()
    .toBoolean()
    .optional()
    .isBoolean()
    .withMessage('liveShowPriceHide must be a boolean'),
  body('videoCallPriceHide')
    .optional()
    .toBoolean()
    .optional()
    .isBoolean()
    .withMessage('videoCallPriceHide must be a boolean'),
  body('becomeBaronistarPriceHide')
    .optional()
    .toBoolean()
    .optional()
    .isBoolean()
    .withMessage('becomeBaronistarPriceHide must be a boolean'),
  body('isTestUser')
    .optional()
    .toBoolean()
    .optional()
    .isBoolean()
    .withMessage('isTestUser must be a boolean'),
];



