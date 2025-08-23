import { body } from 'express-validator';

export const addToFavoritesValidator = [
  body('starId')
    .notEmpty()
    .withMessage('Star ID is required')
    .isMongoId()
    .withMessage('Invalid star ID format')
];

export const removeFromFavoritesValidator = [
  body('starId')
    .notEmpty()
    .withMessage('Star ID is required')
    .isMongoId()
    .withMessage('Invalid star ID format')
];

export const toggleFavoriteValidator = [
  body('starId')
    .notEmpty()
    .withMessage('Star ID is required')
    .isMongoId()
    .withMessage('Invalid star ID format')
];
