import { body, param } from 'express-validator';

export const idParamValidator = [param('id').isMongoId()];

export const typePriceBodyValidator = [
  body('type').isString().trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
];





