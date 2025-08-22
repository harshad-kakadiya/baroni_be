import express from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { uploadVideoOnly } from '../../middlewares/upload.js';
import { 
  createDedicationRequest, 
  listDedicationRequests,
  getDedicationRequest, 
  approveDedicationRequest, 
  rejectDedicationRequest, 
  uploadDedicationVideo, 
  cancelDedicationRequest,
  getDedicationRequestByTrackingId
} from '../../controllers/dedicationRequest.js';
import { idParamValidator, trackingIdParamValidator } from '../../validators/commonValidators.js';
import { createDedicationRequestValidator } from '../../validators/dedicationRequestValidators.js';

const router = express.Router();

// Public route to get dedication request by tracking ID
router.get('/tracking/:trackingId', trackingIdParamValidator, getDedicationRequestByTrackingId);

// Unified routes for fans, stars, and admins
router.post('/', requireAuth, requireRole('fan'), createDedicationRequestValidator, createDedicationRequest);
router.get('/', requireAuth, requireRole('fan', 'star', 'admin'), listDedicationRequests);
router.get('/:id', requireAuth, requireRole('fan', 'star', 'admin'), idParamValidator, getDedicationRequest);

// Role-specific action routes (admin can access all)
router.put('/:id/cancel', requireAuth, requireRole('fan', 'admin'), idParamValidator, cancelDedicationRequest);
router.put('/:id/approve', requireAuth, requireRole('star', 'admin'), idParamValidator, approveDedicationRequest);
router.put('/:id/reject', requireAuth, requireRole('star', 'admin'), idParamValidator, rejectDedicationRequest);
router.put('/:id/upload-video', requireAuth, requireRole('star', 'admin'), idParamValidator, uploadVideoOnly.single('video'), uploadDedicationVideo);

export default router;
