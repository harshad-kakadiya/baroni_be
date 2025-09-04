# Firebase Push Notification System Setup

This document provides a comprehensive guide to set up and use the Firebase push notification system in the Baroni backend.

## Overview

The notification system supports multiple types of notifications:
- **Appointments**: New requests, acceptances, rejections, cancellations, reminders
- **Live Shows**: New shows, cancellations, rescheduling, starting reminders
- **Dedications**: New requests, acceptances, rejections
- **Messages**: New messages from other users
- **Payments**: Transaction confirmations, coin transfers
- **Ratings**: New ratings received, rating confirmations

## Environment Variables Required

Add these environment variables to your `.env` file:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"

# Frontend URL (for live show invite links)
FRONTEND_URL=https://app.baroni.com
```

## Firebase Setup Instructions

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Enable Cloud Messaging (FCM) in the project settings

### 2. Generate Service Account Key
1. Go to Project Settings > Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Extract the following values:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

### 3. Install Dependencies
```bash
npm install firebase-admin@^12.0.0
```

## Database Schema Updates

The User model has been updated to include FCM token storage:

```javascript
// Added to User schema
fcmToken: { type: String, sparse: true, index: true }
```

## API Endpoints

### FCM Token Management
- `PATCH /api/notifications/fcm-token` - Update user's FCM token
- `POST /api/notifications/subscribe/:topic` - Subscribe to notification topic
- `POST /api/notifications/unsubscribe/:topic` - Unsubscribe from topic
- `POST /api/notifications/test` - Send test notification (development)

### Request Body for FCM Token Update
```json
{
  "fcmToken": "your-fcm-token-from-mobile-app"
}
```

## Notification Types and Templates

### Appointment Notifications
- `APPOINTMENT_CREATED` - New appointment request
- `APPOINTMENT_ACCEPTED` - Appointment approved by star
- `APPOINTMENT_REJECTED` - Appointment rejected by star
- `APPOINTMENT_CANCELLED` - Appointment cancelled
- `APPOINTMENT_REMINDER` - Appointment starting soon
- `VIDEO_CALL_REMINDER` - Video call starting in 10 minutes

### Live Show Notifications
- `LIVE_SHOW_CREATED` - New live show created by favorite star
- `LIVE_SHOW_STARTING` - Live show starting soon
- `LIVE_SHOW_CANCELLED` - Live show cancelled
- `LIVE_SHOW_RESCHEDULED` - Live show rescheduled

### Dedication Notifications
- `DEDICATION_REQUEST` - New dedication request
- `DEDICATION_ACCEPTED` - Dedication request accepted
- `DEDICATION_REJECTED` - Dedication request rejected

### Payment Notifications
- `PAYMENT_SUCCESS` - Payment processed successfully
- `PAYMENT_FAILED` - Payment failed
- `COINS_RECEIVED` - Coins received from live show

### Rating Notifications
- `NEW_RATING` - New rating received
- `RATING_THANKS` - Thanks for rating

### Message Notifications
- `NEW_MESSAGE` - New message received

## Usage Examples

### Sending Notifications in Controllers

```javascript
import NotificationHelper from '../utils/notificationHelper.js';

// Send appointment notification
await NotificationHelper.sendAppointmentNotification('APPOINTMENT_CREATED', appointment);

// Send live show notification
await NotificationHelper.sendLiveShowNotification('LIVE_SHOW_CREATED', liveShow);

// Send custom notification
await NotificationHelper.sendCustomNotification(
  userId, 
  'Custom Title', 
  'Custom message body',
  { customData: 'value' }
);
```

### Notification Service Methods

```javascript
import notificationService from '../services/notificationService.js';

// Send to single user
await notificationService.sendToUser(userId, notificationData, additionalData);

// Send to multiple users
await notificationService.sendToMultipleUsers(userIds, notificationData, additionalData);

// Send to topic subscribers
await notificationService.sendToTopic('topic-name', notificationData, additionalData);
```

## Mobile App Integration

### Flutter Example
```dart
import 'package:firebase_messaging/firebase_messaging.dart';

class NotificationService {
  static Future<void> initialize() async {
    // Request permission
    NotificationSettings settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // Get FCM token
    String? token = await FirebaseMessaging.instance.getToken();
    
    // Send token to backend
    if (token != null) {
      await updateFcmToken(token);
    }

    // Handle token refresh
    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
      updateFcmToken(newToken);
    });
  }

  static Future<void> updateFcmToken(String token) async {
    // Call your backend API
    await http.patch(
      Uri.parse('$baseUrl/api/notifications/fcm-token'),
      headers: {'Authorization': 'Bearer $accessToken'},
      body: json.encode({'fcmToken': token}),
    );
  }
}
```

### React Native Example
```javascript
import messaging from '@react-native-firebase/messaging';

class NotificationService {
  static async initialize() {
    // Request permission
    const authStatus = await messaging().requestPermission();
    
    // Get FCM token
    const token = await messaging().getToken();
    
    // Send token to backend
    if (token) {
      await this.updateFcmToken(token);
    }

    // Handle token refresh
    messaging().onTokenRefresh(token => {
      this.updateFcmToken(token);
    });
  }

  static async updateFcmToken(token) {
    // Call your backend API
    await fetch(`${baseUrl}/api/notifications/fcm-token`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fcmToken: token }),
    });
  }
}
```

## Error Handling

The notification system includes comprehensive error handling:

1. **Invalid FCM Tokens**: Automatically removes invalid tokens from user records
2. **Network Errors**: Logs errors but doesn't break application flow
3. **Missing Tokens**: Gracefully handles users without FCM tokens

## Testing

### Test Notification Endpoint
```bash
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Notification",
    "body": "This is a test notification"
  }'
```

### Manual Testing
1. Update user's FCM token via API
2. Trigger notification by performing actions (create appointment, etc.)
3. Check mobile app for received notifications

## Troubleshooting

### Common Issues

1. **"No FCM token found"**
   - Ensure mobile app is sending FCM token to backend
   - Check if user has valid FCM token in database

2. **"Invalid registration token"**
   - Token may be expired or invalid
   - System automatically removes invalid tokens

3. **Notifications not received**
   - Check Firebase project configuration
   - Verify environment variables
   - Check mobile app permission settings

### Debug Logs
The system logs all notification attempts. Check console for:
- Successful notifications: `Notification sent to user {userId}`
- Failed notifications: `Error sending notification to user {userId}`
- Invalid tokens: `Removed invalid FCM token for user {userId}`

## Security Considerations

1. **FCM Token Storage**: Tokens are stored securely in database
2. **Authentication**: All notification endpoints require authentication
3. **Rate Limiting**: Consider implementing rate limiting for notification endpoints
4. **Data Privacy**: Only send necessary data in notification payloads

## Performance Optimization

1. **Batch Notifications**: Use `sendToMultipleUsers` for bulk notifications
2. **Topic Subscriptions**: Use topics for broadcast notifications
3. **Error Handling**: Non-blocking error handling prevents app crashes
4. **Token Management**: Automatic cleanup of invalid tokens

## Future Enhancements

1. **Notification Preferences**: User-specific notification settings
2. **Scheduled Notifications**: Send notifications at specific times
3. **Rich Notifications**: Support for images and actions
4. **Analytics**: Track notification delivery and engagement
5. **A/B Testing**: Test different notification messages
