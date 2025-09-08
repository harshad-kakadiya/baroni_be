# Notification Database Storage & API Documentation

This document describes the enhanced notification system that stores all sent notifications in the database and provides APIs to manage them.

## Overview

The notification system has been enhanced to:
1. Store all sent notifications in the database
2. Track delivery status and failure reasons
3. Provide APIs to list, filter, and manage notifications
4. Support pagination and advanced filtering
5. Maintain notification history for users

## Database Model

### Notification Schema

```javascript
{
  user: ObjectId,           // Reference to User
  title: String,           // Notification title
  body: String,            // Notification body/message
  type: String,            // Type: 'appointment', 'payment', 'rating', 'live_show', 'dedication', 'message', 'general'
  data: Object,            // Additional data payload
  sentAt: Date,            // When notification was sent (default: now)
  fcmMessageId: String,    // Firebase message ID
  deliveryStatus: String,  // 'pending', 'sent', 'delivered', 'failed'
  failureReason: String,   // Reason for failure if delivery failed
  relatedEntity: {         // Reference to related entity
    type: String,          // Entity type: 'appointment', 'transaction', 'dedication', 'live_show', 'message', 'rating'
    id: ObjectId           // Entity ID
  },
  expiresAt: Date          // TTL for notification expiration
}
```

## API Endpoints

All endpoints require authentication via `requireAuth` middleware.

### 1. Get User Notifications

**GET** `/api/notifications`

Retrieve all notifications for the authenticated user, sorted by latest first.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | String | null | Filter by notification type |

#### Example Request

```bash
GET /api/notifications?type=appointment
```

#### Example Response

```json
{
  "success": true,
    "data": {
      "notifications": [
        {
          "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
          "user": "64f1a2b3c4d5e6f7g8h9i0j2",
          "title": "Your video call with Star begins in 10 minutes",
          "body": "Please check your network and be ready to join.",
          "type": "appointment",
          "data": {
            "appointmentId": "64f1a2b3c4d5e6f7g8h9i0j3",
            "starName": "John Doe"
          },
          "sentAt": "2023-09-01T10:30:00.000Z",
          "timeAgo": "2h ago",
          "deliveryStatus": "sent",
          "relatedEntity": {
            "type": "appointment",
            "id": "64f1a2b3c4d5e6f7g8h9i0j3"
          }
        }
      ]
    }
}
```

### 2. Delete Notification

**DELETE** `/api/notifications/:notificationId`

Delete a specific notification.

#### Example Response

```json
{
  "success": true,
  "message": "Notification deleted successfully"
}
```

### 3. Get Notification Statistics

**GET** `/api/notifications/stats`

Get comprehensive statistics about user notifications.

#### Example Response

```json
{
  "success": true,
  "data": {
    "total": 50,
    "byType": {
      "appointment": 20,
      "payment": 15,
      "rating": 8,
      "live_show": 5,
      "dedication": 2
    }
  }
}
```

## API Endpoints Available

- `GET /api/notifications` - List all notifications (latest first)
- `GET /api/notifications/stats` - Get notification statistics
- `DELETE /api/notifications/:id` - Delete notification

## Usage Examples

### Sending Notifications with Database Storage

The notification service automatically stores notifications in the database when sent:

```javascript
import notificationService from '../services/notificationService.js';

// Send a simple notification
const result = await notificationService.sendToUser(
  userId, 
  { 
    title: 'New Message', 
    body: 'You have a new message',
    type: 'message'
  },
  { messageId: '123' },
  {
    priority: 1,
    relatedEntity: { type: 'message', id: '123' }
  }
);

// Send to multiple users
const result = await notificationService.sendToMultipleUsers(
  [userId1, userId2, userId3],
  { 
    title: 'Live Show Starting', 
    body: 'A live show is starting soon!',
    type: 'live_show'
  },
  { liveShowId: '456' },
  {
    relatedEntity: { type: 'live_show', id: '456' }
  }
);

// Create notification without sending (store only)
const result = await notificationService.createNotification(
  userId,
  { 
    title: 'System Maintenance', 
    body: 'Scheduled maintenance in 1 hour',
    type: 'general'
  },
  { maintenanceId: '789' },
  {
    priority: 2,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expires in 24 hours
  }
);
```

### Using Notification Helper

The NotificationHelper class has been updated to work with the new system:

```javascript
import NotificationHelper from '../utils/notificationHelper.js';

// Send appointment notification
await NotificationHelper.sendAppointmentNotification(
  'APPOINTMENT_ACCEPTED',
  appointment,
  { customData: 'value' }
);

// Send video call reminder
await NotificationHelper.sendVideoCallReminder(appointment);

// Send custom notification
await NotificationHelper.sendCustomNotification(
  userId,
  'Custom Title',
  'Custom message body',
  { customData: 'value' }
);
```

## Notification Types

The system supports the following notification types:

- **appointment**: Appointment-related notifications
- **payment**: Payment and transaction notifications
- **rating**: Rating and review notifications
- **live_show**: Live show notifications
- **dedication**: Dedication request notifications
- **message**: Message notifications
- **general**: General system notifications

## Delivery Status Tracking

Notifications are tracked with the following delivery statuses:

- **pending**: Notification created but not yet sent
- **sent**: Successfully sent via FCM
- **delivered**: Confirmed delivery (if supported by FCM)
- **failed**: Failed to send (with failure reason)

## Database Indexes

The following indexes are created for optimal performance:

- `{ user: 1, sentAt: -1 }` - User notifications sorted by date
- `{ user: 1, type: 1, sentAt: -1 }` - Notifications by type for user
- `{ deliveryStatus: 1, sentAt: 1 }` - Failed notifications for retry
- `{ expiresAt: 1 }` - TTL index for automatic cleanup

## Error Handling

The system includes comprehensive error handling:

1. **Database errors**: Notifications are still sent even if database storage fails
2. **FCM errors**: Invalid tokens are automatically removed from users
3. **Validation errors**: Proper error messages for invalid parameters
4. **Authentication errors**: All endpoints require valid authentication

## Performance Considerations

1. **Pagination**: All list endpoints support pagination to handle large datasets
2. **Indexes**: Optimized database indexes for common query patterns
3. **TTL**: Automatic cleanup of expired notifications
4. **Batch operations**: Efficient bulk operations for multiple users

## Migration Notes

Existing notification sending code will continue to work without changes. The new database storage is automatically added to all notification sending operations.

To take advantage of the new features:

1. Update notification sending code to include `relatedEntity` information
2. Use the new API endpoints for notification management
3. Implement proper error handling for the enhanced response format
4. Consider using the `createNotification` method for notifications that don't need immediate FCM sending

## Testing

Use the test endpoint to verify the system:

```bash
POST /api/notifications/test
{
  "title": "Test Notification",
  "body": "This is a test notification"
}
```

This will send a test notification and store it in the database for the authenticated user.
