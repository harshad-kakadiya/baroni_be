import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { getStarAnalytics } from '../../controllers/analytics.js';
import { analyticsDateValidator } from '../../validators/analyticsValidators.js';

const router = express.Router();

// All analytics routes require authentication
router.use(requireAuth);

// Get star analytics dashboard data with optional date filtering
router.get('/star', requireRole('star', 'admin'), analyticsDateValidator, getStarAnalytics);

export default router;




