import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { getStarAnalytics } from '../../controllers/analytics.js';

const router = express.Router();

// All analytics routes require authentication
router.use(requireAuth);

// Get star analytics dashboard data
router.get('/star', requireRole('star', 'admin'), getStarAnalytics);

export default router;
