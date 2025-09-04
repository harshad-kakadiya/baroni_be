# Rating System API Documentation

## Overview
The rating system allows fans to review and rate stars after completing appointments, dedication requests, or live shows. Stars receive an average rating and total review count that is displayed throughout the application.

## Models

### User Model Updates
- `averageRating`: Number (0-5, default: 0) - Star's average rating
- `totalReviews`: Number (default: 0) - Total number of reviews received

### Review Model
- `reviewerId`: ObjectId (ref: User) - Fan who wrote the review
- `starId`: ObjectId (ref: User) - Star being reviewed
- `rating`: Number (1-5) - Rating given
- `comment`: String (max 500 chars) - Optional comment
- `appointmentId`: ObjectId (ref: Appointment) - Associated appointment (if applicable)
- `dedicationRequestId`: ObjectId (ref: DedicationRequest) - Associated dedication (if applicable)
- `liveShowId`: ObjectId (ref: LiveShow) - Associated live show (if applicable)
- `reviewType`: String (enum: 'appointment', 'dedication', 'live_show')

## API Endpoints

### 1. Submit Appointment Review
**POST** `/api/ratings/appointment`

**Authentication:** Required (Fan only)

**Body:**
```json
{
  "appointmentId": "appointment_id_here",
  "rating": 5,
  "comment": "Great experience!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Review submitted successfully",
  "data": {
    "id": "review_id",
    "rating": 5,
    "comment": "Great experience!",
    "reviewer": {
      "id": "fan_id",
      "name": "Fan Name",
      "pseudo": "fan_pseudo",
      "profilePic": "profile_url"
    },
    "createdAt": "2023-12-01T10:00:00.000Z"
  }
}
```

### 2. Submit Dedication Review
**POST** `/api/ratings/dedication`

**Authentication:** Required (Fan only)

**Body:**
```json
{
  "dedicationRequestId": "dedication_request_id_here",
  "rating": 4,
  "comment": "Amazing dedication video!"
}
```

### 3. Submit Live Show Review
**POST** `/api/ratings/live-show`

**Authentication:** Required (Fan only)

**Body:**
```json
{
  "liveShowId": "live_show_id_here",
  "rating": 5,
  "comment": "Incredible show!"
}
```

### 4. Get Star Reviews
**GET** `/api/ratings/star/:starId`

**Authentication:** Not required (Public)

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "review_id",
        "rating": 5,
        "comment": "Great experience!",
        "reviewer": {
          "id": "fan_id",
          "name": "Fan Name",
          "pseudo": "fan_pseudo",
          "profilePic": "profile_url"
        },
        "reviewType": "appointment",
        "createdAt": "2023-12-01T10:00:00.000Z"
      }
    ],
    "star": {
      "averageRating": 4.8,
      "totalReviews": 25
    },
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalReviews": 25,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### 5. Get My Reviews
**GET** `/api/ratings/my-reviews`

**Authentication:** Required

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "review_id",
        "rating": 5,
        "comment": "Great experience!",
        "star": {
          "id": "star_id",
          "name": "Star Name",
          "pseudo": "star_pseudo",
          "profilePic": "profile_url"
        },
        "reviewType": "appointment",
        "createdAt": "2023-12-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalReviews": 15,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### 6. Update Review
**PUT** `/api/ratings/:reviewId`

**Authentication:** Required (Reviewer only)

**Body:**
```json
{
  "rating": 4,
  "comment": "Updated comment"
}
```

### 7. Delete Review
**DELETE** `/api/ratings/:reviewId`

**Authentication:** Required (Reviewer only)

## Business Rules

1. **One Review Per Item**: Each fan can only submit one review per appointment, dedication request, or live show.

2. **Completion Required**: Reviews can only be submitted for completed items:
   - Appointments: status = 'completed'
   - Dedication Requests: status = 'completed'
   - Live Shows: user must be in attendees list

3. **Rating Range**: Ratings must be between 1 and 5 stars.

4. **Comment Length**: Comments are optional but limited to 500 characters.

5. **Automatic Rating Calculation**: Star's average rating and total review count are automatically updated when reviews are submitted, updated, or deleted.

6. **Review Visibility**: All reviews are visible by default.

## Integration with Existing APIs

### Star Listings
The existing star listing endpoints (`/api/star` and `/api/star/:id`) now include:
- `averageRating`: Star's average rating (0-5)
- `totalReviews`: Total number of reviews received

### Star Profile
Star profiles now display:
- Average rating with star display
- Total review count
- Recent reviews (via `/api/ratings/star/:starId`)

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Rating must be between 1 and 5"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Completed appointment not found"
}
```

**400 Duplicate Review:**
```json
{
  "success": false,
  "message": "Review already submitted for this appointment"
}
```

## Frontend Integration

### Rating Display
- Show average rating as stars (filled/empty based on rating)
- Display total review count
- Link to full reviews page

### Review Submission
- Show review form after completion
- Validate rating (1-5 stars required)
- Optional comment field (max 500 chars)
- Prevent duplicate submissions

### Reviews List
- Paginated list of reviews
- Show reviewer info and review date
- Display review type (appointment/dedication/live show)
