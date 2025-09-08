import express from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { updateFcmToken } from '../../controllers/auth.js';
import notificationService from '../../services/notificationService.js';
import {
  getUserNotifications,
  deleteNotification,
  getNotificationStats
} from '../../controllers/notification.js';

const router = express.Router();

router.use(requireAuth);

// Update FCM token
router.patch('/fcm-token', updateFcmToken);

// Subscribe to topic
router.post('/subscribe/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const userId = req.user._id;

    const result = await notificationService.subscribeToTopic(userId, topic);
    
    if (result.success) {
      return res.json({ 
        success: true, 
        message: `Successfully subscribed to ${topic}` 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: result.message || 'Failed to subscribe to topic' 
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Unsubscribe from topic
router.post('/unsubscribe/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const userId = req.user._id;

    const result = await notificationService.unsubscribeFromTopic(userId, topic);
    
    if (result.success) {
      return res.json({ 
        success: true, 
        message: `Successfully unsubscribed from ${topic}` 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: result.message || 'Failed to unsubscribe from topic' 
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Test notification (for development)
router.post('/test', async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, body } = req.body;

    if (!title || !body) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and body are required' 
      });
    }

    const result = await notificationService.sendToUser(userId, { title, body });
    
    if (result.success) {
      return res.json({ 
        success: true, 
        message: 'Test notification sent successfully' 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: result.message || 'Failed to send test notification' 
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get user notifications with pagination and filtering
router.get('/', getUserNotifications);

// Get notification statistics
router.get('/stats', getNotificationStats);

// Delete a specific notification
router.delete('/:notificationId', deleteNotification);

export default router;
