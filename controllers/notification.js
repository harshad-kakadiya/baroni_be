import Notification from '../models/Notification.js';

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
      .populate('user', 'name pseudo profilePic')
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