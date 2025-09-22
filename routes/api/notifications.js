import express from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { updateFcmToken, updateApnsToken } from '../../controllers/auth.js';
import {
  getUserNotifications,
  deleteNotification,
  getNotificationStats,
  sendNotificationToUser,
  sendNotificationToMultipleUsers,
  sendNotificationToLiveShowAttendees,
  sendTestNotification
} from '../../controllers/notification.js';

const router = express.Router();

router.use(requireAuth);

// Update FCM token
router.patch('/fcm-token', updateFcmToken);

// Update APNs token
router.patch('/apns-token', updateApnsToken);

// Test notification (for development)
router.post('/test', sendTestNotification);

// Get user notifications with pagination and filtering
router.get('/', getUserNotifications);

// Get notification statistics
router.get('/stats', getNotificationStats);

// Delete a specific notification
router.delete('/:notificationId', deleteNotification);

// Send notification to a single user
router.post('/send/user', sendNotificationToUser);

// Send notification to multiple users
router.post('/send/bulk', sendNotificationToMultipleUsers);

// Send notification to all attendees of a specific live show
router.post('/send/live-show-attendees', sendNotificationToLiveShowAttendees);

export default router;
