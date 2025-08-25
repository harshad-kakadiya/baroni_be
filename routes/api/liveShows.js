import express from 'express';
import {
  createLiveShow,
  getAllLiveShows,
  getLiveShowById,
  getLiveShowByCode,
  updateLiveShow,
  deleteLiveShow,
  getStarUpcomingShows,
  getStarAllShows,
  scheduleLiveShow,
  cancelLiveShow,
  rescheduleLiveShow
} from '../../controllers/liveShow.js';
import {
  createLiveShowValidator,
  updateLiveShowValidator,
  rescheduleLiveShowValidator
} from '../../validators/liveShowValidators.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/', getAllLiveShows);
router.get('/code/:showCode', getLiveShowByCode);
router.get('/star/:starId/upcoming', getStarUpcomingShows);
router.get('/star/:starId', getStarAllShows);

// Protected routes (authentication required)
router.use(requireAuth);

// CRUD operations for live shows (star only)
router.post('/', requireRole('star'), upload.single('thumbnail'), createLiveShowValidator, createLiveShow);
router.get('/:id', getLiveShowById);
router.put('/:id', requireRole('star', 'admin'), upload.single('thumbnail'), updateLiveShowValidator, updateLiveShow);
router.delete('/:id', requireRole('star', 'admin'), deleteLiveShow);

// New workflow routes
// Fan schedules a pending show
router.patch('/:id/schedule', requireRole('fan', 'admin'), scheduleLiveShow);
// Star cancels a show
router.patch('/:id/cancel', requireRole('star', 'admin'), cancelLiveShow);
// Star reschedules a show (date/time)
router.patch('/:id/reschedule', requireRole('star', 'admin'), rescheduleLiveShowValidator, rescheduleLiveShow);

export default router;
