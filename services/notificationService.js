import admin from 'firebase-admin';
import apn from 'apn';
import User  from '../models/User.js';
import Notification from '../models/Notification.js';
import fs from 'fs';
import path from 'path';

// Initialize Firebase Admin SDK
let firebaseApp;
let isFirebaseInitialized = false;
let apnsProvider = null;

// Helper function to get the correct APNs topic
function getApnsTopic(isVoip = false) {
  if (isVoip) {
    // VoIP notifications should use .voip topic
    return process.env.APNS_VOIP_BUNDLE_ID || (process.env.APNS_BUNDLE_ID ? `${process.env.APNS_BUNDLE_ID}.voip` : undefined);
  } else {
    // Regular push notifications use the main bundle ID
    return process.env.APNS_BUNDLE_ID;
  }
}


// Helper function to get APNs private key from environment variables
function getApnsPrivateKey() {
  // Priority: APNS_PRIVATE_KEY → APNS_PRIVATE_KEY_BASE64 → APNS_PRIVATE_KEY_FILE
  let key = process.env.APNS_PRIVATE_KEY || process.env.APNS_PRIVATE_KEY_BASE64 || '';

  // If provided via BASE64 var, attempt decoding
  if (process.env.APNS_PRIVATE_KEY_BASE64) {
    try {
      const decoded = Buffer.from(process.env.APNS_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
      if (decoded && decoded.includes('-----BEGIN')) key = decoded;
    } catch (_e) {}
  }

  // If provided via file path, read the file
  if (process.env.APNS_PRIVATE_KEY_FILE) {
    try {
      const filePath = path.resolve(process.env.APNS_PRIVATE_KEY_FILE);
      if (fs.existsSync(filePath)) {
        let fromFile = fs.readFileSync(filePath, 'utf8');
        fromFile = fromFile.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!/\n$/.test(fromFile)) fromFile += '\n';
        key = fromFile;
      }
    } catch (_e) {}
  }

  // Strip surrounding quotes if present
  if (key && typeof key === 'string') {
    key = key.replace(/^["']|["']$/g, '').trim();
  }

  return key || null;
}

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
    // Initialize APNs using environment variables only
    const hasTokenCreds = !!(
      process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_BUNDLE_ID &&
      (process.env.APNS_PRIVATE_KEY || process.env.APNS_PRIVATE_KEY_BASE64 || process.env.APNS_PRIVATE_KEY_FILE)
    );

    if (hasTokenCreds) {
      try {
        let normalizedKey = getApnsPrivateKey();
        if (!normalizedKey || !normalizedKey.includes('-----BEGIN') || !normalizedKey.includes('PRIVATE KEY')) {
          throw new Error('APNS_PRIVATE_KEY is not a valid .p8 Auth Key (PEM with BEGIN/END PRIVATE KEY).');
        }
        if (!/\n$/.test(normalizedKey)) normalizedKey += '\n';
        apnsProvider = new apn.Provider({
          token: {
            key: normalizedKey,
            keyId: process.env.APNS_KEY_ID,
            teamId: process.env.APNS_TEAM_ID
          },
          production: process.env.NODE_ENV === 'production'
        });
        console.log('APNs initialized using token-based auth (.p8 key) from environment variables');
      } catch (e) {
        console.warn('Failed to initialize APNs provider (token):', e.message);
        const preview = (process.env.APNS_PRIVATE_KEY || process.env.APNS_PRIVATE_KEY_BASE64 || process.env.APNS_PRIVATE_KEY_FILE || '').toString().slice(0, 40);
        console.warn('APNs token env presence:', {
          hasKeyId: !!process.env.APNS_KEY_ID,
          hasTeamId: !!process.env.APNS_TEAM_ID,
          hasBundleId: !!process.env.APNS_BUNDLE_ID,
          hasPrivateKey: !!(process.env.APNS_PRIVATE_KEY || process.env.APNS_PRIVATE_KEY_BASE64 || process.env.APNS_PRIVATE_KEY_FILE),
          privateKeyPreview: preview
        });
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
      // Continue with sending even if DB save fails
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
      console.log("USER: ",user)
      if (!user || (!user.fcmToken && !user.apnsToken && !user.voipToken)) {
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
      // Prefer APNs if iOS token present, otherwise use FCMm
      let deliverySucceeded = false;
      let fcmResponse = null;
      let apnsResponse = null;

      if (user.apnsToken && apnsProvider) {
        const note = new apn.Notification();
        const isVoip = (
          options.apnsVoip ||
          data.pushType === 'voip' ||
          notificationData.pushType === 'voip' ||
          (typeof notificationData.type === 'string' && notificationData.type.toLowerCase() === 'voip')
        );
        const voipBundle = process.env.APNS_VOIP_BUNDLE_ID || (process.env.APNS_BUNDLE_ID ? `${process.env.APNS_BUNDLE_ID}.voip` : undefined);
        note.topic = isVoip && voipBundle ? voipBundle : process.env.APNS_BUNDLE_ID;
        if (isVoip) {
          note.pushType = 'voip';
          note.contentAvailable = 1;
          note.expiry = Math.floor(Date.now() / 1000) + 3600;
          // VoIP notifications don't support alert, sound, or badge
        } else {
          // Regular push notifications
          note.alert = {
            title: notificationData.title,
            body: notificationData.body
          };
          note.sound = 'default';
          note.badge = 1;
        }
        // Match Flutter's expected payload shape for VoIP pushes
        if (isVoip) {
          note.payload = {
            extra: {
              ...data,
              ...(options.customPayload ? { customPayload: options.customPayload } : {}),
              clickAction: 'FLUTTER_NOTIFICATION_CLICK'
            }
          };
        } else {
          note.payload = { ...data, ...(options.customPayload ? { customPayload: options.customPayload } : {}) };
        }

        apnsResponse = await apnsProvider.send(note, user.apnsToken);
        console.log('[APNs] sendToUser', {
          userId,
          isVoip,
          topic: note.topic,
          title: notificationData.title,
          sent: (apnsResponse && apnsResponse.sent && apnsResponse.sent.length) || 0,
          failed: (apnsResponse && apnsResponse.failed && apnsResponse.failed.length) || 0
        });
        deliverySucceeded = apnsResponse && apnsResponse.sent && apnsResponse.sent.length > 0;
        if (!deliverySucceeded) {
          const reasons = (apnsResponse && apnsResponse.failed || []).map(f => ({ device: f.device, status: f.status, reason: f.response && f.response.reason, error: f.error && f.error.message }));
          console.warn('APNs delivery failed, falling back to FCM if available', reasons);

          // Handle specific APNs token errors (but don't remove tokens)
          if (apnsResponse && apnsResponse.failed && apnsResponse.failed.length > 0) {
            const failedTokens = apnsResponse.failed.map(f => f.device);
            if (failedTokens.length > 0) {
              console.log(`APNs delivery failed for ${failedTokens.length} tokens, but keeping them for retry`);
              // Note: We're not removing APNs tokens on failure as they might be valid
              // and the failure could be temporary (network, server issues, etc.)
            }
          }
        }
        if (deliverySucceeded) {
          const firstSent = apnsResponse.sent && apnsResponse.sent[0];
          console.log('[APNs] success payload/response (sendToUser)', {
            userId,
            topic: note.topic,
            alert: note.alert,
            payload: note.payload,
            response: firstSent && firstSent.response ? firstSent.response : null
          });
        }
      }

      // Handle VoIP token separately for VoIP-specific notifications
      if (!deliverySucceeded && user.voipToken && apnsProvider) {
        const voipTopic = getApnsTopic(true);
        if (!voipTopic) {
          console.warn('[VoIP] No VoIP topic configured, skipping VoIP notification');
        } else {
          const voipNote = new apn.Notification();
          voipNote.topic = voipTopic;
          voipNote.pushType = 'voip';
          voipNote.contentAvailable = 1;
          voipNote.expiry = Math.floor(Date.now() / 1000) + 3600;

          // VoIP notifications don't support alert, sound, or badge
          voipNote.payload = {
            extra: {
              ...data,
              ...(options.customPayload ? { customPayload: options.customPayload } : {}),
              clickAction: 'FLUTTER_NOTIFICATION_CLICK',
              pushType: 'VoIP'
            }
          };

          const voipResponse = await apnsProvider.send(voipNote, user.voipToken);
          console.log('[VoIP] sendToUser', {
            userId,
            topic: voipNote.topic,
            title: notificationData.title,
            sent: (voipResponse && voipResponse.sent && voipResponse.sent.length) || 0,
            failed: (voipResponse && voipResponse.failed && voipResponse.failed.length) || 0
          });

          if (voipResponse && voipResponse.sent && voipResponse.sent.length > 0) {
            deliverySucceeded = true;
          }
          if (voipResponse && voipResponse.failed && voipResponse.failed.length > 0) {
            console.log('[VoIP] failed tokens:', voipResponse.failed);
            // Handle specific VoIP token errors (but don't remove tokens)
            const failedTokens = voipResponse.failed.map(f => f.device);
            if (failedTokens.length > 0) {
              console.log(`VoIP delivery failed for ${failedTokens.length} tokens, but keeping them for retry`);
              // Note: We're not removing VoIP tokens on failure as they might be valid
              // and the failure could be temporary (network, server issues, etc.)
            }
          }
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

      if (
        !deliverySucceeded &&
        user.apnsToken &&
        !apnsProvider &&
        (!user.fcmToken || !this.messaging)
      ) {
        try {
          await Notification.findByIdAndUpdate(notificationRecord._id, {
            deliveryStatus: 'failed',
            failureReason: 'APNs not configured and no FCM fallback'
          });
        } catch (_e) {}
        return { success: false, message: 'APNs not configured and no FCM fallback', notificationId: notificationRecord._id };
      }

      if (!deliverySucceeded) {
        // Prefer a descriptive APNs reason if available
        let reason = 'All push delivery attempts failed';
        if (apnsResponse && Array.isArray(apnsResponse.failed) && apnsResponse.failed.length > 0) {
          const firstFail = apnsResponse.failed[0];
          const apnsReason = (firstFail && firstFail.response && firstFail.response.reason) || (firstFail && firstFail.error && firstFail.error.message);
          if (apnsReason) reason = `APNs failed: ${apnsReason}`;
        }

        // Log the error but don't throw it to prevent breaking the application
        console.error(`[NotificationService] Failed to send notification to user ${userId}:`, reason);

        // Update notification status to failed
        try {
          await Notification.findByIdAndUpdate(notificationRecord._id, {
            deliveryStatus: 'failed',
            failureReason: reason
          });
        } catch (updateError) {
          console.error('Error updating notification status:', updateError);
        }

        return { success: false, message: reason };
      }

      console.log(`Notification sent to user ${userId}`);

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

      try {
        await Notification.findByIdAndUpdate(notificationRecord._id, {
          deliveryStatus: 'failed',
          failureReason: error.message
        });
      } catch (updateError) {
        console.error('Error updating notification status:', updateError);
      }

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
          { apnsToken: { $exists: true, $ne: null } },
          { voipToken: { $exists: true, $ne: null } }
        ]
      });
    } catch (_e) {
      usersWithTokens = [];
    }

    const validUserIds = usersWithTokens.map(user => user._id);
    const fcmTokens = usersWithTokens.filter(u => !!u.fcmToken).map(u => u.fcmToken);
    const apnsTokens = usersWithTokens.filter(u => !!u.apnsToken).map(u => u.apnsToken);
    const voipTokens = usersWithTokens.filter(u => !!u.voipToken).map(u => u.voipToken);

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
      }
    }

    if ((!isFirebaseInitialized || !this.messaging) && (!apnsProvider || (apnsTokens.length === 0 && voipTokens.length === 0))) {
      console.log('No push providers initialized. Multicast notification not sent.');
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
      if (fcmTokens.length === 0 && apnsTokens.length === 0 && voipTokens.length === 0) {
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
        const isVoip = (
          options.apnsVoip ||
          data.pushType === 'voip' ||
          notificationData.pushType === 'voip' ||
          (typeof notificationData.type === 'string' && notificationData.type.toLowerCase() === 'voip')
        );
        const voipBundle = process.env.APNS_VOIP_BUNDLE_ID || (process.env.APNS_BUNDLE_ID ? `${process.env.APNS_BUNDLE_ID}.voip` : undefined);
        note.topic = isVoip && voipBundle ? voipBundle : process.env.APNS_BUNDLE_ID;
        if (isVoip) {
          note.pushType = 'voip';
          note.contentAvailable = 1;
          note.expiry = Math.floor(Date.now() / 1000) + 3600;
          // VoIP notifications don't support alert, sound, or badge
        } else {
          // Regular push notifications
          note.alert = {
            title: notificationData.title,
            body: notificationData.body
          };
          note.sound = 'default';
          note.badge = 1;
        }
        // Match Flutter's expected payload shape for VoIP pushes
        if (isVoip) {
          note.payload = {
            extra: {
              ...data,
              ...(options.customPayload ? { customPayload: options.customPayload } : {}),
              clickAction: 'FLUTTER_NOTIFICATION_CLICK'
            }
          };
        } else {
          note.payload = { ...data, ...(options.customPayload ? { customPayload: options.customPayload } : {}) };
        }

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
          if (resp.sent && resp.sent.length > 0) {
            const firstSent = resp.sent[0];
            console.log('[APNs] success payload/response (sendToMultipleUsers chunk)', {
              topic: note.topic,
              alert: note.alert,
              payload: note.payload,
              response: firstSent && firstSent.response ? firstSent.response : null,
              sentCount: resp.sent.length
            });
          }
        }
        console.log('[APNs] sendToMultipleUsers', {
          isVoip,
          topic: note.topic,
          title: notificationData.title,
          successCount: apnsSuccessCount,
          failureCount: apnsFailureCount
        });
      } else if (!apnsProvider && apnsTokens.length > 0) {
        apnsFailureCount = apnsTokens.length;
        apnsFailedTokens.push(...apnsTokens);
      }

      // Handle VoIP tokens separately
      let voipSuccessCount = 0;
      let voipFailureCount = 0;
      const voipFailedTokens = [];
      if (apnsProvider && voipTokens.length > 0) {
        const voipNote = new apn.Notification();
        voipNote.topic = process.env.APNS_VOIP_BUNDLE_ID || process.env.APNS_BUNDLE_ID;
        voipNote.pushType = 'voip';
        voipNote.contentAvailable = 1;
        voipNote.expiry = Math.floor(Date.now() / 1000) + 3600;

        // VoIP notifications don't support alert, sound, or badge
        voipNote.payload = {
          extra: {
            ...data,
            ...(options.customPayload ? { customPayload: options.customPayload } : {}),
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            pushType: 'VoIP'
          }
        };

        const voipChunks = [];
        const voipChunkSize = 100; // reasonable APNs batch size
        for (let i = 0; i < voipTokens.length; i += voipChunkSize) {
          voipChunks.push(voipTokens.slice(i, i + voipChunkSize));
        }
        for (const chunk of voipChunks) {
          const resp = await apnsProvider.send(voipNote, chunk);
          voipSuccessCount += resp.sent.length;
          voipFailureCount += resp.failed.length;
          voipFailedTokens.push(...resp.failed.map(f => f.device));
          if (resp.sent && resp.sent.length > 0) {
            const firstSent = resp.sent[0];
            console.log('[VoIP] success payload/response (sendToMultipleUsers chunk)', {
              topic: voipNote.topic,
              payload: voipNote.payload,
              response: firstSent && firstSent.response ? firstSent.response : null,
              sentCount: resp.sent.length
            });
          }
        }
        console.log('[VoIP] sendToMultipleUsers', {
          topic: voipNote.topic,
          title: notificationData.title,
          successCount: voipSuccessCount,
          failureCount: voipFailureCount
        });
      } else if (!apnsProvider && voipTokens.length > 0) {
        voipFailureCount = voipTokens.length;
        voipFailedTokens.push(...voipTokens);
      }

      const response = {
        successCount: fcmResponse.successCount + apnsSuccessCount + voipSuccessCount,
        failureCount: fcmResponse.failureCount + apnsFailureCount + voipFailureCount,
        responses: fcmResponse.responses
      };

      try {
        const successfulFcmTokens = [];
        const failedFcmTokens = [];
        (fcmResponse.responses || []).forEach((resp, idx) => {
          if (resp.success) successfulFcmTokens.push(fcmTokens[idx]);
          else failedFcmTokens.push(fcmTokens[idx]);
        });

        if (successfulFcmTokens.length > 0) {
          const successfulUserIds = usersWithTokens
            .filter(user => successfulFcmTokens.includes(user.fcmToken))
            .map(user => user._id);

          await Notification.updateMany(
            { user: { $in: successfulUserIds }, deliveryStatus: 'pending' },
            { deliveryStatus: 'sent' }
          );
        }

        const failedTokens = [...failedFcmTokens, ...apnsFailedTokens, ...voipFailedTokens];
        if (failedTokens.length > 0) {
          const failedUserIds = usersWithTokens
            .filter(user => failedTokens.includes(user.fcmToken) || failedTokens.includes(user.apnsToken) || failedTokens.includes(user.voipToken))
            .map(user => user._id);

          await Notification.updateMany(
            { user: { $in: failedUserIds }, deliveryStatus: 'pending' },
            {
              deliveryStatus: 'failed',
              failureReason: 'Push delivery failed'
            }
          );
        }

        if (failedFcmTokens.length > 0) {
          await User.updateMany(
            { fcmToken: { $in: failedFcmTokens } },
            { $unset: { fcmToken: 1 } }
          );
          console.log(`Removed ${failedFcmTokens.length} invalid FCM tokens`);
        }
        if (apnsFailedTokens.length > 0) {
          console.log(`APNs delivery failed for ${apnsFailedTokens.length} tokens, but keeping them for retry`);
          // Note: We're not removing APNs tokens on failure as they might be valid
          // and the failure could be temporary (network, server issues, etc.)
        }
        if (voipFailedTokens.length > 0) {
          console.log(`VoIP delivery failed for ${voipFailedTokens.length} tokens, but keeping them for retry`);
          // Note: We're not removing VoIP tokens on failure as they might be valid
          // and the failure could be temporary (network, server issues, etc.)
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
      DEDICATION_REQUEST_CREATED: {
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
      DEDICATION_VIDEO_UPLOADED: {
        title: 'Dedication Video Uploaded',
        body: 'Your dedication video has been uploaded.',
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
