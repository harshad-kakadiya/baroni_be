import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { idParamValidator } from '../../validators/commonValidators.js';
import { body } from 'express-validator';
import { uploadVideoOnly } from '../../middlewares/upload.js';
import { createDedicationSample, listMyDedicationSamples, getDedicationSample, updateDedicationSample, deleteDedicationSample } from '../../controllers/dedicationSample.js';

const router = express.Router();

router.use(requireAuth, requireRole('star', 'admin'));

const sampleCreateValidator = [
  body('type').isString().trim().notEmpty(),
  body('video').custom((val, { req }) => {
    const hasFile = !!(req.file && req.file.buffer);
    const hasUrl = typeof val === 'string' && val.trim().length > 0;
    if (!hasFile && !hasUrl) {
      throw new Error('Video is required');
    }
    return true;
  }),
];

const sampleUpdateValidator = [
  body('type').optional().isString().trim().notEmpty(),
  body('video').optional().custom((val, { req }) => {
    if (val === undefined && !(req.file && req.file.buffer)) return true;
    const hasFile = !!(req.file && req.file.buffer);
    const hasUrl = typeof val === 'string' && val.trim().length > 0;
    if (!hasFile && !hasUrl) {
      throw new Error('Provide a non-empty video URL or upload a file');
    }
    return true;
  }),
];

router.get('/', listMyDedicationSamples);
router.get('/:id', idParamValidator, getDedicationSample);
router.post('/', uploadVideoOnly.single('video'), sampleCreateValidator, createDedicationSample);
router.put('/:id', idParamValidator, uploadVideoOnly.single('video'), sampleUpdateValidator, updateDedicationSample);
router.delete('/:id', idParamValidator, deleteDedicationSample);

export default router;


