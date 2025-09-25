import { body, param } from 'express-validator';

export const idParamValidator = [param('id').isMongoId()];

export const trackingIdParamValidator = [param('trackingId').isString().trim().notEmpty().matches(/^BAR-[A-Z0-9]{5}$/)];

export const typePriceBodyValidator = [
  body('type').isString().trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
];



















