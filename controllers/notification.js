import Notification from '../models/Notification.js';
import LiveShowAttendance from '../models/LiveShowAttendance.js';
import LiveShow from '../models/LiveShow.js';
import notificationService from '../services/notificationService.js';

/**
 * Get notifications for the authenticated user
 */
export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type = null } = req.query;

    // Validate type filter
    const allowedTypes = ['appointment', 'payment', 'rating', 'live_show', 'dedication', 'message', 'general'];
    const typeFilter = type && allowedTypes.includes(type) ? type : null;

    const query = { user: userId };
    if (typeFilter) {
      query.type = typeFilter;
    }

    // Get all notifications sorted by sentAt (latest first)
    const notifications = await Notification.find(query)
      .sort({ sentAt: -1 })
      .populate('user', 'name pseudo profilePic agoraKey')
      .lean();

    // Add timeAgo to each notification
    const notificationsWithTimeAgo = notifications.map(notification => ({
      ...notification,
      timeAgo: getTimeAgo(notification.sentAt)
    }));

    res.json({
      success: true,
      data: {
        notifications: notificationsWithTimeAgo
      }
    });
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
};

/**
 * Delete a specific notification
 */
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification'
    });
  }
};

/**
 * Get notification statistics for the authenticated user
 */
export const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await Notification.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byType: {
            $push: {
              type: '$type'
            }
          }
        }
      },
      {
        $project: {
          total: 1,
          byType: {
            $reduce: {
              input: '$byType',
              initialValue: {},
              in: {
                $mergeObjects: [
                  '$$value',
                  {
                    $let: {
                      vars: {
                        type: '$$this.type'
                      },
                      in: {
                        $mergeObjects: [
                          { $arrayToObject: [[{ k: '$$type', v: 0 }]] },
                          {
                            $arrayToObject: [[
                              {
                                k: '$$type',
                                v: {
                                  $add: [
                                    { $ifNull: [{ $getField: { field: '$$type', input: '$$value' } }, 0] },
                                    1
                                  ]
                                }
                              }
                            ]]
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      byType: {}
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification statistics'
    });
  }
};

/**
 * Send a test notification to the authenticated user
 */
export const sendTestNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, body, data = {}, customPayload, type } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required'
      });
    }

    const result = await notificationService.sendToUser(
      userId,
      { title, body, type },
      data,
      { customPayload }
    );

    if (result.success) {
      return res.json({
        success: true,
        message: 'Test notification sent successfully',
        data: { notificationId: result.notificationId, messageId: result.messageId }
      });
    }

    return res.status(400).json({
      success: false,
      message: result.message || result.error || 'Failed to send test notification'
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send a notification to a single user
 */
export const sendNotificationToUser = async (req, res) => {
  try {
    const { userId, title, body, type, data = {}, customPayload, expiresAt, relatedEntity } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ success: false, message: 'userId, title, and body are required' });
    }

    const result = await notificationService.sendToUser(
      userId,
      { title, body, type },
      data,
      { customPayload, expiresAt, relatedEntity }
    );

    if (result.success) {
      return res.json({ success: true, data: { notificationId: result.notificationId, messageId: result.messageId } });
    }

    return res.status(400).json({ success: false, message: result.message || result.error || 'Failed to send notification' });
  } catch (error) {
    console.error('Error sending notification to user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send a notification to multiple users
 */
export const sendNotificationToMultipleUsers = async (req, res) => {
  try {
    const { userIds, title, body, type, data = {}, customPayload, expiresAt, relatedEntity } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0 || !title || !body) {
      return res.status(400).json({ success: false, message: 'userIds (non-empty array), title, and body are required' });
    }

    const result = await notificationService.sendToMultipleUsers(
      userIds,
      { title, body, type },
      data,
      { customPayload, expiresAt, relatedEntity }
    );

    if (result.success) {
      return res.json({ success: true, data: { successCount: result.successCount, failureCount: result.failureCount } });
    }

    return res.status(400).json({ success: false, message: result.message || result.error || 'Failed to send notifications' });
  } catch (error) {
    console.error('Error sending notifications to multiple users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send notification to all users who have joined a specific live show
 */
export const sendNotificationToLiveShowAttendees = async (req, res) => {
  try {
    const { liveShowId, type = 'live_show', data = {}, customPayload, expiresAt } = req.body;

    if (!liveShowId) {
      return res.status(400).json({ 
        success: false, 
        message: 'liveShowId is required' 
      });
    }

    // First, verify that the live show exists and get its details
    const liveShow = await LiveShow.findById(liveShowId)
      .populate('starId', 'name pseudo profilePic agoraKey')
      .lean();

    if (!liveShow) {
      return res.status(404).json({
        success: false,
        message: 'Live show not found'
      });
    }

    // Get all users who have joined this live show (pending attendance before completion)
    const attendances = await LiveShowAttendance.find({
      liveShowId: liveShowId,
      status: 'pending'
    }).select('fanId').lean();

    if (attendances.length === 0) {
      return res.json({
        success: true,
        message: 'No attendees found for this live show',
        data: { successCount: 0, failureCount: 0, totalAttendees: 0 }
      });
    }

    // Extract user IDs
    const userIds = attendances.map(attendance => attendance.fanId);

    // Auto-generate title and body based on live show status and time
    const now = new Date();
    const showDate = new Date(liveShow.date);
    const timeDiff = showDate.getTime() - now.getTime();
    const hoursUntilShow = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutesUntilShow = Math.floor(timeDiff / (1000 * 60));

    let title, body;
    
    if (liveShow.status === 'cancelled') {
      title = 'Live Show Cancelled';
      body = `"${liveShow.sessionTitle}" by ${liveShow.starId.name} has been cancelled.`;
    } else if (liveShow.status === 'completed') {
      title = 'Live Show Completed';
      body = `"${liveShow.sessionTitle}" by ${liveShow.starId.name} has ended. Thank you for joining!`;
    } else if (hoursUntilShow <= 0 && minutesUntilShow <= 0) {
      title = 'Live Show Starting Now!';
      body = `"${liveShow.sessionTitle}" by ${liveShow.starId.name} is starting right now! Join now!`;
    } else if (hoursUntilShow < 1) {
      title = 'Live Show Starting Soon!';
      body = `"${liveShow.sessionTitle}" by ${liveShow.starId.name} starts in ${minutesUntilShow} minutes!`;
    } else if (hoursUntilShow < 24) {
      title = 'Live Show Reminder';
      body = `"${liveShow.sessionTitle}" by ${liveShow.starId.name} starts in ${hoursUntilShow} hours!`;
    } else {
      title = 'Live Show Update';
      body = `Update about "${liveShow.sessionTitle}" by ${liveShow.starId.name}`;
    }

    // Prepare live show data for frontend
    const liveShowData = {
      ...liveShow,
      _id: liveShow._id,
      sessionTitle: liveShow.sessionTitle,
      date: liveShow.date,
      time: liveShow.time,
      attendanceFee: liveShow.attendanceFee,
      maxCapacity: liveShow.maxCapacity,
      currentAttendees: liveShow.currentAttendees,
      showCode: liveShow.showCode,
      inviteLink: liveShow.inviteLink,
      // Force status to pending for attendee notifications; overall show completes later
      status: 'pending',
      description: liveShow.description,
      thumbnail: liveShow.thumbnail,
      starId: liveShow.starId,
      starBaroniId: liveShow.starId && liveShow.starId.baroniId ? liveShow.starId.baroniId : undefined,
      createdAt: liveShow.createdAt,
      updatedAt: liveShow.updatedAt
    };

    // Merge live show data with any additional data provided
    const notificationData = {
      ...data,
      liveShow: liveShowData
    };

    // Send notifications to all attendees
    const result = await notificationService.sendToMultipleUsers(
      userIds,
      { title, body, type },
      notificationData,
      { 
        customPayload, 
        expiresAt, 
        relatedEntity: {
          type: 'live_show',
          id: liveShowId
        }
      }
    );

    if (result.success) {
      return res.json({
        success: true,
        message: `Notifications sent to live show attendees`,
        data: {
          successCount: result.successCount,
          failureCount: result.failureCount,
          totalAttendees: userIds.length,
          liveShow: {
            _id: liveShow._id,
            sessionTitle: liveShow.sessionTitle,
            showCode: liveShow.showCode
          }
        }
      });
    }

    return res.status(400).json({
      success: false,
      message: result.message || result.error || 'Failed to send notifications to live show attendees'
    });
  } catch (error) {
    console.error('Error sending notifications to live show attendees:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error while sending notifications' 
    });
  }
};

/**
 * Helper function to calculate time ago
 */
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds}s ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
}