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
  cancelLiveShow,
  rescheduleLiveShow, toggleLikeLiveShow,
  joinLiveShow,
  getMyJoinedLiveShows,
  completeLiveShowAttendance
} from '../../controllers/liveShow.js';
import {
  createLiveShowValidator,
  updateLiveShowValidator,
  rescheduleLiveShowValidator
} from '../../validators/liveShowValidators.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';

const router = express.Router();

router.use(requireAuth);

// Get live shows (all users)
router.get('/', getAllLiveShows);
router.get('/code/:showCode', getLiveShowByCode);
router.get('/star/:starId/upcoming', getStarUpcomingShows);
router.get('/star/:starId', getStarAllShows);
router.get('/me/joined', getMyJoinedLiveShows);
router.get('/:id', getLiveShowById);

// CRUD operations for live shows (star only)
router.post('/', requireRole('star'), upload.single('thumbnail'), createLiveShowValidator, createLiveShow);
router.put('/:id', requireRole('star', 'admin'), upload.single('thumbnail'), updateLiveShowValidator, updateLiveShow);
router.delete('/:id', requireRole('star', 'admin'), deleteLiveShow);

// Likes
router.post('/:id/like', toggleLikeLiveShow);

// Fan joins a live show (requires successful transaction)
router.post('/:id/join', requireRole('fan', 'admin'), joinLiveShow);
// Star cancels a show
router.patch('/:id/cancel', requireRole('star', 'admin'), cancelLiveShow);
// Star reschedules a show (date/time)
router.patch('/:id/reschedule', requireRole('star', 'admin'), rescheduleLiveShowValidator, rescheduleLiveShow);
// Star completes live show attendance and transfers coins
router.post('/:id/complete-attendance', requireRole('star', 'admin'), completeLiveShowAttendance);

export default router;
