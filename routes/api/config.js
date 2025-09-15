import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { getPublicConfig, upsertConfig } from '../../controllers/config.js';
import { upsertConfigValidation } from '../../validators/configValidators.js';

const router = express.Router();

// Public: get current config
router.get('/', getPublicConfig);

// Admin: create/update config
router.put('/', requireAuth, requireRole('admin'), upsertConfigValidation, upsertConfig);
router.post('/', requireAuth, requireRole('admin'), upsertConfigValidation, upsertConfig);

export default router;





