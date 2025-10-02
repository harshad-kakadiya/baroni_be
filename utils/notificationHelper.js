import notificationService from '../services/notificationService.js';
import  User  from '../models/User.js';

class NotificationHelper {
  /**
   * Send appointment-related notifications
   */
  static async sendAppointmentNotification(type, appointment, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const baseTemplate = templates[type];

    if (!baseTemplate) {
      console.error(`Notification template not found for type: ${type}`);
      return;
    }

    // Try to fetch minimal user info for personalized messages
    let fanName = 'Fan';
    let starName = 'Star';
    try {
      const users = await User.find({ _id: { $in: [appointment.fanId, appointment.starId] } }).select('name');
      for (const u of users) {
        if (String(u._id) === String(appointment.fanId)) fanName = u.name || fanName;
        if (String(u._id) === String(appointment.starId)) starName = u.name || starName;
      }
    } catch (_e) {}

    // Check if appointment is in the past
    const isPastAppointment = appointment.startTime && new Date(appointment.startTime) < new Date();
    
    const data = {
      type: baseTemplate.type,
      appointmentId: appointment._id.toString(),
      starId: appointment.starId?.toString?.() || String(appointment.starId || ''),
      fanId: appointment.fanId?.toString?.() || String(appointment.fanId || ''),
      starName,
      fanName,
      navigateTo: 'appointment',
      eventType: type,
      isMessage: isPastAppointment ? false : (additionalData.isMessage || true),
      ...additionalData
    };

    // Get current user ID from additionalData
    const currentUserId = additionalData.currentUserId || '';

    // Fan message
    const fanTemplate = {
      ...baseTemplate,
      ...(type === 'APPOINTMENT_CREATED' ? { body: `Your appointment request has been sent to ${starName}.` } : {})
    };

    // Star message
    const starTemplate = {
      ...baseTemplate,
      ...(type === 'APPOINTMENT_CREATED' ? { title: 'New Appointment Request', body: `You have a new appointment request from ${fanName}.` } : {})
    };

    // Send to star if star is not the current user.
    // Also notify star on cancellation when cancelled by fan.
    if (appointment.starId && String(appointment.starId) !== String(currentUserId)) {
      const starNote = { ...starTemplate };
      if (type === 'APPOINTMENT_CANCELLED' && String(currentUserId) === String(appointment.fanId)) {
        starNote.title = 'Appointment Cancelled';
        starNote.body = `${fanName} has cancelled the appointment.`;
      }
      await notificationService.sendToUser(data.starId, starNote, data, {
        relatedEntity: { type: 'appointment', id: appointment._id }
      });
    }

    // Send to fan if fan is not the current user and it's not an appointment creation
    // Fan should not receive notifications when they are booking an appointment (APPOINTMENT_CREATED)
    if (appointment.fanId && 
        String(appointment.fanId) !== String(currentUserId) && 
        type !== 'APPOINTMENT_CREATED') {
      
      // Customize fan template based on action type
      if (type === 'APPOINTMENT_APPROVED') {
        fanTemplate.title = 'Appointment Approved';
        fanTemplate.body = `${starName} has approved your appointment request.`;
      } else if (type === 'APPOINTMENT_REJECTED') {
        fanTemplate.title = 'Appointment Rejected';
        fanTemplate.body = `${starName} has rejected your appointment request.`;
      } else if (type === 'APPOINTMENT_CANCELLED') {
        fanTemplate.title = 'Appointment Cancelled';
        // Notify fan only when cancelled by star
        if (String(currentUserId) === String(appointment.starId)) {
          fanTemplate.body = `${starName} has cancelled your appointment.`;
        } else {
          // If fan cancelled themselves, don't notify the fan
          return;
        }
      } else if (type === 'APPOINTMENT_COMPLETED') {
        fanTemplate.title = 'Appointment Completed';
        fanTemplate.body = `Your appointment with ${starName} has been completed.`;
      }
      
      await notificationService.sendToUser(data.fanId, fanTemplate, data, {
        relatedEntity: { type: 'appointment', id: appointment._id }
      });
    } else if (type === 'APPOINTMENT_CREATED') {
      // Logging for debugging purposes when not sending to fan during appointment creation
      console.log('[AppointmentNotification] Not sending to fan for appointment creation', {
        appointmentId: appointment._id?.toString?.() || String(appointment._id || ''),
        userId: appointment.fanId?.toString?.() || String(appointment.fanId || '')
      });
    }
  }

  /**
   * Send video call reminder
   */
  static async sendVideoCallReminder(appointment, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const template = templates.VIDEO_CALL_REMINDER;

    // Check if appointment is in the past
    const isPastAppointment = appointment.startTime && new Date(appointment.startTime) < new Date();

    const data = {
      type: template.type,
      appointmentId: appointment._id.toString(),
      starName: appointment.starName || 'Star',
      fanName: appointment.fanName || 'Fan',
      isMessage: isPastAppointment ? false : (additionalData.isMessage || true)
    };

    // Get current user ID from additionalData
    const currentUserId = additionalData.currentUserId || '';

    // Customize message for each user
    const fanTemplate = {
      ...template,
      body: `Your video call with ${appointment.starName || 'Star'} begins in 10 minutes. Please check your network and be ready to join.`
    };

    const starTemplate = {
      ...template,
      body: `Your video call with ${appointment.fanName || 'Fan'} begins in 10 minutes. Please check your network and be ready to join.`
    };

    // Send to fan if fan is not the current user
    if (appointment.fanId && String(appointment.fanId) !== String(currentUserId)) {
      await notificationService.sendToUser(appointment.fanId, fanTemplate, data, {
        relatedEntity: { type: 'appointment', id: appointment._id }
      });
    }

    // Send to star if star is not the current user
    if (appointment.starId && String(appointment.starId) !== String(currentUserId)) {
      const result = await notificationService.sendToUser(appointment.starId, starTemplate, data, {
        relatedEntity: { type: 'appointment', id: appointment._id }
      });
      console.log('[AppointmentNotification] sent to star', {
        appointmentId: appointment._id?.toString?.() || String(appointment._id || ''),
        userId: appointment.starId?.toString?.() || String(appointment.starId || ''),
        template: { title: starTemplate.title, body: starTemplate.body },
        data,
        result
      });
    }
  }

  /**
   * Send payment notifications
   */
  static async sendPaymentNotification(type, transaction, additionalData = {}) {
    const templates = notificationService.constructor.getNotificationTemplates();
    const baseTemplate = templates[type];

    if (!baseTemplate) {
      console.error(`Notification template not found for type: ${type}`);
      return;
    }

    // Fetch names of payer and receiver
    let payerName = 'User';
    let receiverName = 'User';
    try {
      const users = await User.find({ _id: { $in: [transaction.payerId, transaction.receiverId] } }).select('name');
      for (const u of users) {
        if (String(u._id) === String(transaction.payerId)) payerName = u.name || payerName;
        if (String(u._id) === String(transaction.receiverId)) receiverName = u.name || receiverName;
      }
    } catch (_e) {}

    const data = {
      type: baseTemplate.type,
      transactionId: transaction._id.toString(),
      amount: transaction.amount,
      payerName,
      receiverName,
      ...additionalData
    };

    // Get current user ID from additionalData
    const currentUserId = additionalData.currentUserId || '';

    // Dynamic titles/bodies based on transaction context
    const tType = transaction.type;
    const meta = transaction.metadata || transaction.meta || {};
    const amountStr = typeof transaction.amount === 'number' ? transaction.amount.toString() : transaction.amount;
    const currency = meta.currency || 'coins';

    let template = { ...baseTemplate };
    if (tType === 'live_show_attendance_payment') {
      const showTitle = meta.showTitle ? `"${meta.showTitle}"` : 'Live Show';
      template = {
        ...baseTemplate,
        title: 'Live Show booked',
        body: `You booked ${showTitle}${amountStr ? ` • ${amountStr} ${currency}` : ''}.`
      };
    } else if (tType === 'live_show_hosting_payment') {
      const showTitle = meta.showTitle ? `"${meta.showTitle}"` : 'your Live Show';
      template = {
        ...baseTemplate,
        title: 'Hosting fee paid',
        body: `Your hosting fee for ${showTitle} was paid${amountStr ? ` • ${amountStr} ${currency}` : ''}.`
      };
    } else if (type === 'PAYMENT_SUCCESS') {
      template = {
        ...baseTemplate,
        title: 'Payment successful',
        body: `Payment completed${amountStr ? ` • ${amountStr} ${currency}` : ''}.`
      };
    } else if (type === 'PAYMENT_FAILED') {
      template = {
        ...baseTemplate,
        title: 'Payment failed',
        body: 'Your payment could not be processed. Please try again.'
      };
    }

    // Send to the user who made the payment if they are not the current user
    if (transaction.userId && String(transaction.userId) !== String(currentUserId)) {
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

    // Fetch names
    let fanName = 'Fan';
    let starName = 'Star';
    try {
      const users = await User.find({ _id: { $in: [rating.fanId, rating.starId] } }).select('name');
      for (const u of users) {
        if (String(u._id) === String(rating.fanId)) fanName = u.name || fanName;
        if (String(u._id) === String(rating.starId)) starName = u.name || starName;
      }
    } catch (_e) {}

    const data = {
      type: template.type,
      ratingId: rating._id.toString(),
      fanName,
      starName,
      ...additionalData
    };

    // Get current user ID from additionalData
    const currentUserId = additionalData.currentUserId || '';

    // Send to the star who received the rating if star is not the current user
    if (rating.starId && String(rating.starId) !== String(currentUserId)) {
      await notificationService.sendToUser(rating.starId, template, data, {
        relatedEntity: { type: 'rating', id: rating._id }
      });
    }

    // Send to the fan who gave the rating (for thanks message) if fan is not the current user
    if (type === 'RATING_THANKS' && rating.fanId && String(rating.fanId) !== String(currentUserId)) {
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
    const baseTemplate = templates[type];

    if (!baseTemplate) {
      console.error(`Notification template not found for type: ${type}`);
      return;
    }

    const starName = liveShow?.starId?.name || liveShow?.starName || 'Star';
    const data = {
      type: baseTemplate.type,
      liveShowId: liveShow._id.toString(),
      starId: liveShow.starId?._id?.toString?.() || liveShow.starId?.toString?.() || String(liveShow.starId || ''),
      starName,
      pushType: 'VoIP',
      navigateTo: 'live_show',
      eventType: type,
      ...additionalData
    };

    // Get current user ID from additionalData
    const currentUserId = additionalData.currentUserId || '';

    // Build dynamic, descriptive title/body
    
    const showTitle = liveShow?.sessionTitle ? `"${liveShow.sessionTitle}"` : 'a live show';
    const dateStr = liveShow?.date ? new Date(liveShow.date).toLocaleString() : undefined;

    let template = { ...baseTemplate };
    switch (type) {
      case 'LIVE_SHOW_CREATED':
        template = {
          ...baseTemplate,
          title: `${starName} scheduled a Live Show`,
          body: `${starName} created ${showTitle}${dateStr ? ` on ${dateStr}` : ''}. Tap to view.`
        };
        break;
      case 'LIVE_SHOW_STARTING':
        template = {
          ...baseTemplate,
          title: 'Live Show starting soon',
          body: `${showTitle} is starting soon. Get ready to join!`
        };
        break;
      case 'LIVE_SHOW_CANCELLED':
        template = {
          ...baseTemplate,
          title: 'Live Show cancelled',
          body: `${showTitle} was cancelled by ${starName}.`
        };
        break;
      case 'LIVE_SHOW_RESCHEDULED':
        template = {
          ...baseTemplate,
          title: 'Live Show rescheduled',
          body: `${showTitle} was rescheduled${dateStr ? ` to ${dateStr}` : ''}.`
        };
        break;
    }

    switch (type) {
      case 'LIVE_SHOW_CREATED':
        // Send to all fans who have this star as favorite
        await this.sendToStarFollowers(liveShow.starId, template, data, { apnsVoip: true, currentUserId });
        break;

      case 'LIVE_SHOW_STARTING':
        // Send to all fans who joined this live show
        await this.sendToLiveShowAttendees(liveShow._id, template, data, { apnsVoip: true, currentUserId });
        break;

      case 'LIVE_SHOW_CANCELLED':
      case 'LIVE_SHOW_RESCHEDULED':
        // Send to star if not current user
        if (liveShow.starId && String(liveShow.starId) !== String(currentUserId)) {
          await notificationService.sendToUser(liveShow.starId, template, data, {
            relatedEntity: { type: 'live_show', id: liveShow._id },
            apnsVoip: true
          });
        }
        await this.sendToLiveShowAttendees(liveShow._id, template, data, { apnsVoip: true, currentUserId });
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

    // Check if dedication is in the past
    const isPastDedication = dedication.deliveryDate && new Date(dedication.deliveryDate) < new Date();

    const data = {
      type: template.type,
      dedicationId: dedication._id.toString(),
      isMessage: isPastDedication ? false : (additionalData.isMessage || true),
      ...additionalData
    };

    // Get current user ID from additionalData
    const currentUserId = additionalData.currentUserId || '';

    console.log('[DedicationNotification] invoked', {
      type,
      dedicationId: dedication?._id?.toString?.() || String(dedication?._id || ''),
      fanId: dedication?.fanId?.toString?.() || String(dedication?.fanId || ''),
      starId: dedication?.starId?.toString?.() || String(dedication?.starId || ''),
      currentUserId
    });

    // Customize message for dedication accepted
    if (type === 'DEDICATION_ACCEPTED') {
      const customTemplate = {
        ...template,
        body: `Your dedication Request was accepted by ${dedication.starName || 'Star'}`
      };

      if (dedication.fanId && String(dedication.fanId) !== String(currentUserId)) {
        console.log('[DedicationNotification] send to fan (accepted)', {
          userId: dedication.fanId?.toString?.() || String(dedication.fanId || ''),
          title: customTemplate.title
        });
        await notificationService.sendToUser(dedication.fanId, customTemplate, data, {
          relatedEntity: { type: 'dedication', id: dedication._id }
        });
      }
    } else if (type === 'DEDICATION_REQUEST' || type === 'DEDICATION_REQUEST_CREATED') {
      // Send to star for new requests
      if (dedication.starId && String(dedication.starId) !== String(currentUserId)) {
        console.log('[DedicationNotification] send to star (request)', {
          userId: dedication.starId?.toString?.() || String(dedication.starId || ''),
          title: template.title
        });
        await notificationService.sendToUser(dedication.starId, template, data, {
          relatedEntity: { type: 'dedication', id: dedication._id }
        });
      }
    } else if (type === 'DEDICATION_REJECTED') {
      // Send to fan for rejections
      if (dedication.fanId && String(dedication.fanId) !== String(currentUserId)) {
        console.log('[DedicationNotification] send to fan (rejected)', {
          userId: dedication.fanId?.toString?.() || String(dedication.fanId || ''),
          title: template.title
        });
        await notificationService.sendToUser(dedication.fanId, template, data, {
          relatedEntity: { type: 'dedication', id: dedication._id }
        });
      }
    } else if (type === 'DEDICATION_CANCELLED') {
      // Notify counterpart only: if star cancelled, notify fan; if fan cancelled, notify star
      const notifyFan = dedication.fanId && String(currentUserId) === String(dedication.starId);
      const notifyStar = dedication.starId && String(currentUserId) === String(dedication.fanId);

      if (notifyFan && String(dedication.fanId) !== String(currentUserId)) {
        const custom = { ...template, title: 'Dedication Cancelled', body: 'Your dedication request was cancelled by the star.' };
        await notificationService.sendToUser(dedication.fanId, custom, data, {
          relatedEntity: { type: 'dedication', id: dedication._id }
        });
      }
      if (notifyStar && String(dedication.starId) !== String(currentUserId)) {
        const custom = { ...template, title: 'Dedication Cancelled', body: 'The fan cancelled their dedication request.' };
        await notificationService.sendToUser(dedication.starId, custom, data, {
          relatedEntity: { type: 'dedication', id: dedication._id }
        });
      }
    } else if (type === 'DEDICATION_VIDEO_UPLOADED') {
      // Notify fan about video upload
      const customTemplate = {
        ...template,
        body: `Your dedication video was uploaded by ${dedication.starName || 'Star'}.`
      };
      if (dedication.fanId && String(dedication.fanId) !== String(currentUserId)) {
        console.log('[DedicationNotification] send to fan (video_uploaded)', {
          userId: dedication.fanId?.toString?.() || String(dedication.fanId || ''),
          title: customTemplate.title
        });
        await notificationService.sendToUser(dedication.fanId, customTemplate, data, {
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
    const baseTemplate = templates.NEW_MESSAGE;

    const data = {
      type: baseTemplate.type,
      messageId: message._id.toString(),
      conversationId: message.conversationId?.toString(),
      senderName,
      ...additionalData
    };

    // Get current user ID from additionalData
    const currentUserId = additionalData.currentUserId || '';

    // Personalize message notification
    let senderName = 'Someone';
    try {
      if (message.senderId) {
        const sender = await User.findById(message.senderId).select('name pseudo');
        senderName = sender?.name || sender?.pseudo || senderName;
      }
    } catch (_e) {}

    const isImage = message.type === 'image' || !!message.imageUrl;
    const preview = (message.message || '').trim();
    const template = {
      ...baseTemplate,
      title: `New message from ${senderName}`,
      body: isImage ? 'Sent an image' : (preview || 'Sent a message')
    };

    // Send to the recipient if they are not the current user
    if (message.receiverId && String(message.receiverId) !== String(currentUserId)) {
      await notificationService.sendToUser(message.receiverId, template, data, {
        relatedEntity: { type: 'message', id: message._id }
      });
    }
  }

  /**
   * Send notification to star's followers
   */
  static async sendToStarFollowers(starId, template, data = {}, options = {}) {
    try {
      // Get current user ID from options
      const currentUserId = options.currentUserId || '';

      // Find users who have this star as favorite
      const followers = await User.find({
        favorites: { $in: [starId] },
        role: 'fan',
        $or: [
          { fcmToken: { $exists: true, $ne: null } },
          { apnsToken: { $exists: true, $ne: null } },
          { voipToken: { $exists: true, $ne: null } }
        ]
      });

      // Filter out current user from followers
      const followerIds = followers
        .filter(follower => String(follower._id) !== String(currentUserId))
        .map(follower => follower._id);

      if (followerIds.length > 0) {
        await notificationService.sendToMultipleUsers(followerIds, template, data, {
          relatedEntity: { type: 'live_show', id: starId },
          apnsVoip: options.apnsVoip === true
        });
      }
    } catch (error) {
      console.error('Error sending notification to star followers:', error);
    }
  }

  /**
   * Send notification to live show attendees
   */
  static async sendToLiveShowAttendees(liveShowId, template, data = {}, options = {}) {
    try {
      // Get current user ID from options
      const currentUserId = options.currentUserId || '';

      // Import LiveShowAttendance model
      const { LiveShowAttendance } = await import('../models/LiveShowAttendance.js');

      const attendees = await LiveShowAttendance.find({
        liveShowId: liveShowId,
        status: 'joined'
      }).populate('userId', 'fcmToken apnsToken voipToken role');

      const attendeeIds = attendees
        .filter(attendance => 
          attendance.userId?.role === 'fan' && 
          (attendance.userId?.fcmToken || attendance.userId?.apnsToken || attendance.userId?.voipToken) &&
          String(attendance.userId._id) !== String(currentUserId)
        )
        .map(attendance => attendance.userId._id);

      if (attendeeIds.length > 0) {
        await notificationService.sendToMultipleUsers(attendeeIds, template, data, {
          relatedEntity: { type: 'live_show', id: liveShowId },
          apnsVoip: options.apnsVoip === true
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
