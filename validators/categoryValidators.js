import { body, param } from 'express-validator';

export const createCategoryValidator = [
  body('name').isString().trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('image').optional().isURL().withMessage('Image must be a valid URL'),
];

export const updateCategoryValidator = [
  param('id').isMongoId(),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 100 }),
  body('image').optional().isURL(),
];

export const categoryIdValidator = [param('id').isMongoId()];







