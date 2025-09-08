import notificationService from '../services/notificationService.js';
import  User  from '../models/User.js';

class NotificationHelper {
  /**
   * Send appointment-related notifications
   */
  static async sendAppointmentNotification(type, appointment, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const template = templates[type];

    if (!template) {
      console.error(`Notification template not found for type: ${type}`);
      return;
    }

    const data = {
      type: template.type,
      appointmentId: appointment._id.toString(),
      ...additionalData
    };

    // Send to fan
    if (appointment.fanId) {
      await notificationService.sendToUser(appointment.fanId, template, data, {
        relatedEntity: { type: 'appointment', id: appointment._id }
      });
    }

    // Send to star
    if (appointment.starId) {
      await notificationService.sendToUser(appointment.starId, template, data, {
        relatedEntity: { type: 'appointment', id: appointment._id }
      });
    }
  }

  /**
   * Send video call reminder
   */
  static async sendVideoCallReminder(appointment) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const template = templates.VIDEO_CALL_REMINDER;

    const data = {
      type: template.type,
      appointmentId: appointment._id.toString(),
      starName: appointment.starName || 'Star',
      fanName: appointment.fanName || 'Fan'
    };

    // Customize message for each user
    const fanTemplate = {
      ...template,
      body: `Your video call with ${appointment.starName || 'Star'} begins in 10 minutes. Please check your network and be ready to join.`
    };

    const starTemplate = {
      ...template,
      body: `Your video call with ${appointment.fanName || 'Fan'} begins in 10 minutes. Please check your network and be ready to join.`
    };

    // Send to fan
    if (appointment.fanId) {
      await notificationService.sendToUser(appointment.fanId, fanTemplate, data, {
        relatedEntity: { type: 'appointment', id: appointment._id }
      });
    }

    // Send to star
    if (appointment.starId) {
      await notificationService.sendToUser(appointment.starId, starTemplate, data, {
        relatedEntity: { type: 'appointment', id: appointment._id }
      });
    }
  }

  /**
   * Send payment notifications
   */
  static async sendPaymentNotification(type, transaction, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const template = templates[type];

    if (!template) {
      console.error(`Notification template not found for type: ${type}`);
      return;
    }

    const data = {
      type: template.type,
      transactionId: transaction._id.toString(),
      amount: transaction.amount,
      ...additionalData
    };

    // Send to the user who made the payment
    if (transaction.userId) {
      await notificationService.sendToUser(transaction.userId, template, data, {
        relatedEntity: { type: 'transaction', id: transaction._id }
      });
    }
  }

  /**
   * Send rating notifications
   */
  static async sendRatingNotification(type, rating, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const template = templates[type];

    if (!template) {
      console.error(`Notification template not found for type: ${type}`);
      return;
    }

    const data = {
      type: template.type,
      ratingId: rating._id.toString(),
      ...additionalData
    };

    // Send to the star who received the rating
    if (rating.starId) {
      await notificationService.sendToUser(rating.starId, template, data, {
        relatedEntity: { type: 'rating', id: rating._id }
      });
    }

    // Send to the fan who gave the rating (for thanks message)
    if (type === 'RATING_THANKS' && rating.fanId) {
      await notificationService.sendToUser(rating.fanId, template, data, {
        relatedEntity: { type: 'rating', id: rating._id }
      });
    }
  }

  /**
   * Send live show notifications
   */
  static async sendLiveShowNotification(type, liveShow, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const template = templates[type];

    if (!template) {
      console.error(`Notification template not found for type: ${type}`);
      return;
    }

    const data = {
      type: template.type,
      liveShowId: liveShow._id.toString(),
      ...additionalData
    };

    switch (type) {
      case 'LIVE_SHOW_CREATED':
        // Send to all fans who have this star as favorite
        await this.sendToStarFollowers(liveShow.starId, template, data);
        break;

      case 'LIVE_SHOW_STARTING':
        // Send to all fans who joined this live show
        await this.sendToLiveShowAttendees(liveShow._id, template, data);
        break;

      case 'LIVE_SHOW_CANCELLED':
      case 'LIVE_SHOW_RESCHEDULED':
        // Send to star and all attendees
        if (liveShow.starId) {
          await notificationService.sendToUser(liveShow.starId, template, data, {
            relatedEntity: { type: 'live_show', id: liveShow._id }
          });
        }
        await this.sendToLiveShowAttendees(liveShow._id, template, data);
        break;
    }
  }

  /**
   * Send dedication notifications
   */
  static async sendDedicationNotification(type, dedication, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const template = templates[type];

    if (!template) {
      console.error(`Notification template not found for type: ${type}`);
      return;
    }

    const data = {
      type: template.type,
      dedicationId: dedication._id.toString(),
      ...additionalData
    };

    // Customize message for dedication accepted
    if (type === 'DEDICATION_ACCEPTED') {
      const customTemplate = {
        ...template,
        body: `Your dedication Request was accepted by ${dedication.starName || 'Star'}`
      };

      if (dedication.fanId) {
        await notificationService.sendToUser(dedication.fanId, customTemplate, data, {
          relatedEntity: { type: 'dedication', id: dedication._id }
        });
      }
    } else {
      // Send to star for new requests
      if (type === 'DEDICATION_REQUEST' && dedication.starId) {
        await notificationService.sendToUser(dedication.starId, template, data, {
          relatedEntity: { type: 'dedication', id: dedication._id }
        });
      }

      // Send to fan for rejections
      if (type === 'DEDICATION_REJECTED' && dedication.fanId) {
        await notificationService.sendToUser(dedication.fanId, template, data, {
          relatedEntity: { type: 'dedication', id: dedication._id }
        });
      }
    }
  }

  /**
   * Send message notifications
   */
  static async sendMessageNotification(message, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const template = templates.NEW_MESSAGE;

    const data = {
      type: template.type,
      messageId: message._id.toString(),
      conversationId: message.conversationId?.toString(),
      ...additionalData
    };

    // Send to the recipient
    if (message.receiverId) {
      await notificationService.sendToUser(message.receiverId, template, data, {
        relatedEntity: { type: 'message', id: message._id }
      });
    }
  }

  /**
   * Send notification to star's followers
   */
  static async sendToStarFollowers(starId, template, data = {}) {
    try {
      // Find users who have this star as favorite
      const followers = await User.find({
        favorites: { $in: [starId] },
        fcmToken: { $exists: true, $ne: null }
      });

      const followerIds = followers.map(follower => follower._id);

      if (followerIds.length > 0) {
        await notificationService.sendToMultipleUsers(followerIds, template, data, {
          relatedEntity: { type: 'live_show', id: starId }
        });
      }
    } catch (error) {
      console.error('Error sending notification to star followers:', error);
    }
  }

  /**
   * Send notification to live show attendees
   */
  static async sendToLiveShowAttendees(liveShowId, template, data = {}) {
    try {
      // Import LiveShowAttendance model
      const { LiveShowAttendance } = await import('../models/LiveShowAttendance.js');

      const attendees = await LiveShowAttendance.find({
        liveShowId: liveShowId,
        status: 'joined'
      }).populate('userId', 'fcmToken');

      const attendeeIds = attendees
        .filter(attendance => attendance.userId?.fcmToken)
        .map(attendance => attendance.userId._id);

      if (attendeeIds.length > 0) {
        await notificationService.sendToMultipleUsers(attendeeIds, template, data, {
          relatedEntity: { type: 'live_show', id: liveShowId }
        });
      }
    } catch (error) {
      console.error('Error sending notification to live show attendees:', error);
    }
  }

  /**
   * Send custom notification
   */
  static async sendCustomNotification(userId, title, body, data = {}) {
    const notificationData = { title, body };
    await notificationService.sendToUser(userId, notificationData, data);
  }

  /**
   * Send notification to multiple users with custom message
   */
  static async sendCustomNotificationToMultiple(userIds, title, body, data = {}) {
    const notificationData = { title, body };
    await notificationService.sendToMultipleUsers(userIds, notificationData, data);
  }
}

export default NotificationHelper;
