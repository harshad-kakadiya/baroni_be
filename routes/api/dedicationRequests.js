import express from 'express';
import {requireAuth, requireRole} from '../../middlewares/auth.js';
import { uploadVideoOnly } from '../../middlewares/upload.js';
import { 
  createDedicationRequest, 
  listDedicationRequests,
  getDedicationRequest, 
  approveDedicationRequest, 
  rejectDedicationRequest, 
  uploadDedicationVideo,
  completeDedicationByFan,
  cancelDedicationRequest,
  getDedicationRequestByTrackingId
} from '../../controllers/dedicationRequest.js';
import { idParamValidator, trackingIdParamValidator } from '../../validators/commonValidators.js';
import { createDedicationRequestValidator } from '../../validators/dedicationRequestValidators.js';

const router = express.Router();
router.use(requireAuth);
// Public route to get dedication request by tracking ID
router.get('/tracking/:trackingId', trackingIdParamValidator, getDedicationRequestByTrackingId);

// Unified routes for fans, stars, and admins
router.post('/', requireRole('fan'), createDedicationRequestValidator, createDedicationRequest);
router.get('/', requireRole('fan', 'star', 'admin'), listDedicationRequests);
router.get('/:id', requireRole('fan', 'star', 'admin'), idParamValidator, getDedicationRequest);

// Role-specific action routes (admin can access all)
router.put('/:id/cancel', requireRole('fan', 'admin'), idParamValidator, cancelDedicationRequest);
router.put('/:id/approve', requireRole('star', 'admin'), idParamValidator, approveDedicationRequest);
router.put('/:id/reject', requireRole('star', 'admin'), idParamValidator, rejectDedicationRequest);
// Star uploads the dedication video
router.put('/:id/upload-video', requireRole('star', 'admin'), idParamValidator, uploadVideoOnly.single('video'), uploadDedicationVideo);

// Fan confirms completion after viewing the video
router.put('/:id/complete', requireRole('fan', 'admin'), idParamValidator, completeDedicationByFan);

export default router;
