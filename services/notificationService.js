import admin from 'firebase-admin';
import apn from 'apn';
import User  from '../models/User.js';
import Notification from '../models/Notification.js';

// Initialize Firebase Admin SDK
let firebaseApp;
let isFirebaseInitialized = false;
let apnsProvider = null;

try {
  firebaseApp = admin.app();
  isFirebaseInitialized = true;
} catch (error) {
  // Check if Firebase credentials are provided
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
      isFirebaseInitialized = true;
    } catch (initError) {
      console.warn('Failed to initialize Firebase Admin SDK:', initError.message);
      isFirebaseInitialized = false;
    }
  } else {
    console.warn('Firebase credentials not provided. Notification service will be disabled.');
    isFirebaseInitialized = false;
  }
}

class NotificationService {
  constructor() {
    this.messaging = isFirebaseInitialized ? admin.messaging() : null;
    // Initialize APNs provider if credentials are present
    if (
      process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_BUNDLE_ID &&
      process.env.APNS_PRIVATE_KEY
    ) {
      try {
        apnsProvider = new apn.Provider({
          token: {
            key: Buffer.from(process.env.APNS_PRIVATE_KEY.replace(/\\n/g, '\n')),
            keyId: process.env.APNS_KEY_ID,
            teamId: process.env.APNS_TEAM_ID
          },
          production: process.env.NODE_ENV === 'production'
        });
      } catch (e) {
        console.warn('Failed to initialize APNs provider:', e.message);
      }
    } else {
      console.warn('APNs credentials not provided. iOS APNs notifications will be disabled.');
    }
  }

  /**
   * Send notification to a single user
   * @param {string} userId - User ID to send notification to
   * @param {Object} notificationData - Notification data
   * @param {Object} data - Additional data payload
   * @param {Object} options - Additional options for notification storage
   */
  async sendToUser(userId, notificationData, data = {}, options = {}) {
    // Create notification record in database first
    const notificationRecord = new Notification({
      user: userId,
      title: notificationData.title,
      body: notificationData.body,
      type: notificationData.type || 'general',
      data: data,
      customPayload: options.customPayload,
      expiresAt: options.expiresAt,
      relatedEntity: options.relatedEntity,
      deliveryStatus: 'pending'
    });

    try {
      await notificationRecord.save();
    } catch (dbError) {
      console.error(`Error saving notification to database for user ${userId}:`, dbError);
      // Continue with FCM sending even if DB save fails
    }

    if (!isFirebaseInitialized || !this.messaging) {
      console.log('Firebase not initialized. Notification not sent.');
      // Update notification status to failed
      try {
        await Notification.findByIdAndUpdate(notificationRecord._id, {
          deliveryStatus: 'failed',
          failureReason: 'Firebase not initialized'
        });
      } catch (updateError) {
        console.error('Error updating notification status:', updateError);
      }
      return { success: false, message: 'Firebase not initialized' };
    }

    try {
      const user = await User.findById(userId);
      if (!user || (!user.fcmToken && !user.apnsToken)) {
        console.log(`No push token found for user ${userId}`);
        // Update notification status to failed
        try {
          await Notification.findByIdAndUpdate(notificationRecord._id, {
            deliveryStatus: 'failed',
            failureReason: 'No push token found'
          });
        } catch (updateError) {
          console.error('Error updating notification status:', updateError);
        }
        return { success: false, message: 'No push token found' };
      }
      // Prefer APNs if iOS token present, otherwise use FCM
      let deliverySucceeded = false;
      let fcmResponse = null;
      let apnsResponse = null;

      if (user.apnsToken && apnsProvider) {
        const note = new apn.Notification();
        const isVoip = options.apnsVoip || data.pushType === 'voip' || notificationData.pushType === 'voip';
        const voipBundle = process.env.APNS_VOIP_BUNDLE_ID || (process.env.APNS_BUNDLE_ID ? `${process.env.APNS_BUNDLE_ID}.voip` : undefined);
        note.topic = isVoip && voipBundle ? voipBundle : process.env.APNS_BUNDLE_ID;
        if (isVoip) {
          note.pushType = 'voip';
          note.expiry = Math.floor(Date.now() / 1000) + 3600;
        }
        note.alert = {
          title: notificationData.title,
          body: notificationData.body
        };
        note.sound = 'default';
        note.badge = 1;
        note.payload = { ...data, ...(options.customPayload ? { customPayload: options.customPayload } : {}) };

        apnsResponse = await apnsProvider.send(note, user.apnsToken);
        deliverySucceeded = apnsResponse && apnsResponse.sent && apnsResponse.sent.length > 0;
        if (!deliverySucceeded) {
          console.warn('APNs delivery failed, falling back to FCM if available', apnsResponse && apnsResponse.failed);
        }
      }

      if (!deliverySucceeded && user.fcmToken && this.messaging) {
        const message = {
          token: user.fcmToken,
          notification: {
            title: notificationData.title,
            body: notificationData.body,
          },
          data: {
            ...data,
            ...(options.customPayload ? { customPayload: options.customPayload } : {}),
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            sound: 'default',
          },
          android: {
            notification: {
              sound: 'default',
              channelId: 'default',
              priority: 'high',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        };
        fcmResponse = await this.messaging.send(message);
        deliverySucceeded = !!fcmResponse;
      }

      // If we still haven't delivered and the only available token was APNs but APNs is not configured
      if (
        !deliverySucceeded &&
        user.apnsToken &&
        !apnsProvider &&
        (!user.fcmToken || !this.messaging)
      ) {
        // Update notification status to failed with explicit reason
        try {
          await Notification.findByIdAndUpdate(notificationRecord._id, {
            deliveryStatus: 'failed',
            failureReason: 'APNs not configured and no FCM fallback'
          });
        } catch (_e) {}
        return { success: false, message: 'APNs not configured and no FCM fallback', notificationId: notificationRecord._id };
      }

      if (!deliverySucceeded) {
        throw new Error('All push delivery attempts failed');
      }

      console.log(`Notification sent to user ${userId}`);
      
      // Update notification status to sent
      try {
        const update = { deliveryStatus: 'sent' };
        if (fcmResponse) update.fcmMessageId = fcmResponse;
        await Notification.findByIdAndUpdate(notificationRecord._id, update);
      } catch (updateError) {
        console.error('Error updating notification status:', updateError);
      }
      
      return { success: true, messageId: fcmResponse || (apnsResponse && apnsResponse.sent && apnsResponse.sent[0] && apnsResponse.sent[0].response) || null, notificationId: notificationRecord._id };
    } catch (error) {
      console.error(`Error sending notification to user ${userId}:`, error);

      // Update notification status to failed
      try {
        await Notification.findByIdAndUpdate(notificationRecord._id, {
          deliveryStatus: 'failed',
          failureReason: error.message
        });
      } catch (updateError) {
        console.error('Error updating notification status:', updateError);
      }

      // If token is invalid, remove it from user
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        await User.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } });
        console.log(`Removed invalid FCM token for user ${userId}`);
      }

      return { success: false, error: error.message, notificationId: notificationRecord._id };
    }
  }

  /**
   * Send notification to multiple users
   * @param {Array} userIds - Array of user IDs
   * @param {Object} notificationData - Notification data
   * @param {Object} data - Additional data payload
   * @param {Object} options - Additional options for notification storage
   */
  async sendToMultipleUsers(userIds, notificationData, data = {}, options = {}) {
    // Fetch users who have any valid push tokens
    let usersWithTokens = [];
    try {
      usersWithTokens = await User.find({
        _id: { $in: userIds },
        $or: [
          { fcmToken: { $exists: true, $ne: null } },
          { apnsToken: { $exists: true, $ne: null } }
        ]
      });
    } catch (_e) {
      usersWithTokens = [];
    }

    const validUserIds = usersWithTokens.map(user => user._id);
    const fcmTokens = usersWithTokens.filter(u => !!u.fcmToken).map(u => u.fcmToken);
    const apnsTokens = usersWithTokens.filter(u => !!u.apnsToken).map(u => u.apnsToken);

    // Create notification records ONLY for users who have tokens
    let notificationRecords = [];
    if (validUserIds.length > 0) {
      notificationRecords = validUserIds.map((uid) => new Notification({
        user: uid,
        title: notificationData.title,
        body: notificationData.body,
        type: notificationData.type || 'general',
        data: data,
        customPayload: options.customPayload,
        expiresAt: options.expiresAt,
        relatedEntity: options.relatedEntity,
        deliveryStatus: 'pending'
      }));

      try {
        await Notification.insertMany(notificationRecords);
      } catch (dbError) {
        console.error('Error saving notifications to database:', dbError);
        // Continue with FCM sending even if DB save fails
      }
    }

    if ((!isFirebaseInitialized || !this.messaging) && (!apnsProvider || apnsTokens.length === 0)) {
      console.log('No push providers initialized. Multicast notification not sent.');
      // Update created notification statuses to failed
      try {
        if (notificationRecords.length > 0) {
          const notificationIds = notificationRecords.map(n => n._id);
          await Notification.updateMany(
            { _id: { $in: notificationIds } },
            {
              deliveryStatus: 'failed',
              failureReason: (!apnsProvider ? 'APNs not configured' : 'Firebase not initialized')
            }
          );
        }
      } catch (updateError) {
        console.error('Error updating notification statuses:', updateError);
      }
      return { success: false, message: (!apnsProvider ? 'APNs not configured' : 'Firebase not initialized') };
    }

    try {
      if (fcmTokens.length === 0 && apnsTokens.length === 0) {
        // No valid tokens. If any notifications were created, mark them failed
        try {
          if (notificationRecords.length > 0) {
            const notificationIds = notificationRecords.map(n => n._id);
            await Notification.updateMany(
              { _id: { $in: notificationIds } },
              {
                deliveryStatus: 'failed',
                failureReason: 'No valid push tokens found'
              }
            );
          }
        } catch (updateError) {
          console.error('Error updating notification statuses:', updateError);
        }
        return { success: false, message: 'No valid push tokens found' };
      }

      let fcmResponse = { successCount: 0, failureCount: 0, responses: [] };
      if (isFirebaseInitialized && this.messaging && fcmTokens.length > 0) {
        const fcmMessage = {
          notification: {
            title: notificationData.title,
            body: notificationData.body,
          },
          data: {
            ...data,
            ...(options.customPayload ? { customPayload: options.customPayload } : {}),
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            sound: 'default',
          },
          android: {
            notification: {
              sound: 'default',
              channelId: 'default',
              priority: 'high',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
          tokens: fcmTokens,
        };
        fcmResponse = await this.messaging.sendMulticast(fcmMessage);
      }

      let apnsSuccessCount = 0;
      let apnsFailureCount = 0;
      const apnsFailedTokens = [];
      if (apnsProvider && apnsTokens.length > 0) {
        const note = new apn.Notification();
        const isVoip = options.apnsVoip || data.pushType === 'voip' || notificationData.pushType === 'voip';
        const voipBundle = process.env.APNS_VOIP_BUNDLE_ID || (process.env.APNS_BUNDLE_ID ? `${process.env.APNS_BUNDLE_ID}.voip` : undefined);
        note.topic = isVoip && voipBundle ? voipBundle : process.env.APNS_BUNDLE_ID;
        if (isVoip) {
          note.pushType = 'voip';
          note.expiry = Math.floor(Date.now() / 1000) + 3600;
        }
        note.alert = {
          title: notificationData.title,
          body: notificationData.body
        };
        note.sound = 'default';
        note.badge = 1;
        note.payload = { ...data, ...(options.customPayload ? { customPayload: options.customPayload } : {}) };

        const chunks = [];
        const chunkSize = 100; // reasonable APNs batch size
        for (let i = 0; i < apnsTokens.length; i += chunkSize) {
          chunks.push(apnsTokens.slice(i, i + chunkSize));
        }
        for (const chunk of chunks) {
          const resp = await apnsProvider.send(note, chunk);
          apnsSuccessCount += resp.sent.length;
          apnsFailureCount += resp.failed.length;
          apnsFailedTokens.push(...resp.failed.map(f => f.device));
        }
      } else if (!apnsProvider && apnsTokens.length > 0) {
        // Mark APNs paths failed if tokens exist but APNs isn't configured
        apnsFailureCount = apnsTokens.length;
        apnsFailedTokens.push(...apnsTokens);
      }
      const response = { successCount: fcmResponse.successCount + apnsSuccessCount, failureCount: fcmResponse.failureCount + apnsFailureCount, responses: fcmResponse.responses };

      // Update notification statuses based on delivery results
      try {
        const successfulFcmTokens = [];
        const failedFcmTokens = [];
        (fcmResponse.responses || []).forEach((resp, idx) => {
          if (resp.success) successfulFcmTokens.push(fcmTokens[idx]);
          else failedFcmTokens.push(fcmTokens[idx]);
        });

        // Update successful notifications
        if (successfulFcmTokens.length > 0) {
          const successfulUserIds = usersWithTokens
            .filter(user => successfulFcmTokens.includes(user.fcmToken))
            .map(user => user._id);
          
          await Notification.updateMany(
            { user: { $in: successfulUserIds }, deliveryStatus: 'pending' },
            { deliveryStatus: 'sent' }
          );
        }

        // Update failed notifications
        const failedTokens = [...failedFcmTokens, ...apnsFailedTokens];
        if (failedTokens.length > 0) {
          const failedUserIds = usersWithTokens
            .filter(user => failedTokens.includes(user.fcmToken) || failedTokens.includes(user.apnsToken))
            .map(user => user._id);
          
          await Notification.updateMany(
            { user: { $in: failedUserIds }, deliveryStatus: 'pending' },
            { 
              deliveryStatus: 'failed',
              failureReason: 'Push delivery failed'
            }
          );
        }

        // Remove invalid tokens
        if (failedFcmTokens.length > 0) {
          await User.updateMany(
            { fcmToken: { $in: failedFcmTokens } },
            { $unset: { fcmToken: 1 } }
          );
          console.log(`Removed ${failedFcmTokens.length} invalid FCM tokens`);
        }
        if (apnsFailedTokens.length > 0) {
          await User.updateMany(
            { apnsToken: { $in: apnsFailedTokens } },
            { $unset: { apnsToken: 1 } }
          );
          console.log(`Removed ${apnsFailedTokens.length} invalid APNs tokens`);
        }
      } catch (updateError) {
        console.error('Error updating notification statuses:', updateError);
      }

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount
      };
    } catch (error) {
      console.error('Error sending multicast notification:', error);
      
      // Update all notification statuses to failed
      try {
        const notificationIds = notificationRecords.map(n => n._id);
        await Notification.updateMany(
          { _id: { $in: notificationIds } },
          {
            deliveryStatus: 'failed',
            failureReason: error.message
          }
        );
      } catch (updateError) {
        console.error('Error updating notification statuses:', updateError);
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to topic subscribers
   * @param {string} topic - Topic name
   * @param {Object} notificationData - Notification data
   * @param {Object} data - Additional data payload
   */
  async sendToTopic(topic, notificationData, data = {}) {
    if (!isFirebaseInitialized || !this.messaging) {
      console.log('Firebase not initialized. Topic notification not sent.');
      return { success: false, message: 'Firebase not initialized' };
    }

    try {
      const message = {
        topic: topic,
        notification: {
          title: notificationData.title,
          body: notificationData.body,
        },
        data: {
          ...data,
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          sound: 'default',
        },
        android: {
          notification: {
            sound: 'default',
            channelId: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await this.messaging.send(message);
      console.log(`Topic notification sent to ${topic}:`, response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error(`Error sending topic notification to ${topic}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe user to a topic
   * @param {string} userId - User ID
   * @param {string} topic - Topic name
   */
  async subscribeToTopic(userId, topic) {
    if (!isFirebaseInitialized || !this.messaging) {
      console.log('Firebase not initialized. Topic subscription not performed.');
      return { success: false, message: 'Firebase not initialized' };
    }

    try {
      const user = await User.findById(userId);
      if (!user || !user.fcmToken) {
        return { success: false, message: 'No FCM token found' };
      }

      await this.messaging.subscribeToTopic([user.fcmToken], topic);
      console.log(`User ${userId} subscribed to topic ${topic}`);
      return { success: true };
    } catch (error) {
      console.error(`Error subscribing user ${userId} to topic ${topic}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe user from a topic
   * @param {string} userId - User ID
   * @param {string} topic - Topic name
   */
  async unsubscribeFromTopic(userId, topic) {
    if (!isFirebaseInitialized || !this.messaging) {
      console.log('Firebase not initialized. Topic unsubscription not performed.');
      return { success: false, message: 'Firebase not initialized' };
    }

    try {
      const user = await User.findById(userId);
      if (!user || !user.fcmToken) {
        return { success: false, message: 'No FCM token found' };
      }

      await this.messaging.unsubscribeFromTopic([user.fcmToken], topic);
      console.log(`User ${userId} unsubscribed from topic ${topic}`);
      return { success: true };
    } catch (error) {
      console.error(`Error unsubscribing user ${userId} from topic ${topic}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a notification record without sending it
   * @param {string} userId - User ID
   * @param {Object} notificationData - Notification data
   * @param {Object} data - Additional data payload
   * @param {Object} options - Additional options for notification storage
   */
  async createNotification(userId, notificationData, data = {}, options = {}) {
    try {
      const notificationRecord = new Notification({
        user: userId,
        title: notificationData.title,
        body: notificationData.body,
        type: notificationData.type || 'general',
        data: data,
        customPayload: options.customPayload,
        expiresAt: options.expiresAt,
        relatedEntity: options.relatedEntity,
        deliveryStatus: 'pending'
      });

      await notificationRecord.save();
      return { success: true, notificationId: notificationRecord._id };
    } catch (error) {
      console.error(`Error creating notification for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Notification templates for different types
  static getNotificationTemplates() {
    return {
      // Appointment notifications
      APPOINTMENT_CREATED: {
        title: 'New Appointment Request',
        body: 'You have a new appointment request waiting for your response.',
        type: 'appointment'
      },
      APPOINTMENT_ACCEPTED: {
        title: 'Appointment Accepted',
        body: 'Your appointment request has been accepted!',
        type: 'appointment'
      },
      APPOINTMENT_REJECTED: {
        title: 'Appointment Rejected',
        body: 'Your appointment request has been rejected.',
        type: 'appointment'
      },
      APPOINTMENT_CANCELLED: {
        title: 'Appointment Cancelled',
        body: 'An appointment has been cancelled.',
        type: 'appointment'
      },
      APPOINTMENT_REMINDER: {
        title: 'Appointment Reminder',
        body: 'Your appointment is starting soon. Please be ready!',
        type: 'appointment'
      },
      VIDEO_CALL_REMINDER: {
        title: 'Video Call Reminder',
        body: 'Your video call begins in 10 minutes. Please check your network and be ready to join.',
        type: 'appointment'
      },

      // Payment notifications
      PAYMENT_SUCCESS: {
        title: 'Payment Successful',
        body: 'Your payment has been processed successfully.',
        type: 'payment'
      },
      PAYMENT_FAILED: {
        title: 'Payment Failed',
        body: 'Your payment could not be processed. Please try again.',
        type: 'payment'
      },
      COINS_RECEIVED: {
        title: 'Coins Received',
        body: 'You have received coins from your live show!',
        type: 'payment'
      },

      // Rating notifications
      NEW_RATING: {
        title: 'New Rating Received',
        body: 'You have received a new rating from a fan.',
        type: 'rating'
      },
      RATING_THANKS: {
        title: 'Thanks for Rating!',
        body: 'Thanks for rating your last call!',
        type: 'rating'
      },

      // Live Show notifications
      LIVE_SHOW_CREATED: {
        title: 'New Live Show',
        body: 'A new live show has been created by your favorite star!',
        type: 'live_show'
      },
      LIVE_SHOW_STARTING: {
        title: 'Live Show Starting',
        body: 'A live show you joined is starting soon!',
        type: 'live_show'
      },
      LIVE_SHOW_CANCELLED: {
        title: 'Live Show Cancelled',
        body: 'A live show has been cancelled.',
        type: 'live_show'
      },
      LIVE_SHOW_RESCHEDULED: {
        title: 'Live Show Rescheduled',
        body: 'A live show has been rescheduled.',
        type: 'live_show'
      },

      // Dedication notifications
      DEDICATION_REQUEST: {
        title: 'New Dedication Request',
        body: 'You have a new dedication request.',
        type: 'dedication'
      },
      DEDICATION_ACCEPTED: {
        title: 'Dedication Request Accepted',
        body: 'Your dedication request was accepted!',
        type: 'dedication'
      },
      DEDICATION_REJECTED: {
        title: 'Dedication Request Rejected',
        body: 'Your dedication request was rejected.',
        type: 'dedication'
      },

      // Message notifications
      NEW_MESSAGE: {
        title: 'New Message',
        body: 'You have received a new message.',
        type: 'message'
      },

      // General notifications
      GENERAL: {
        title: 'Notification',
        body: 'You have a new notification.',
        type: 'general'
      }
    };
  }
}

export default new NotificationService();
