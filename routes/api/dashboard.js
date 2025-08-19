import express from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { getDashboard } from '../../controllers/dashboard.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getDashboard);

export default router;

