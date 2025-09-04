# Live Shows API Documentation

## New Endpoint: Get My Shows

### Endpoint
```
GET /api/live-shows/me/shows
```

### Description
This endpoint returns different live shows based on the user's role:
- **For Fans**: Returns all live shows they have joined
- **For Stars**: Returns all live shows they have hosted

### Authentication
- Requires authentication token in header
- Only accessible by users with 'fan' or 'star' roles

### Query Parameters
- `status` (optional): Filter by show status ('active' or 'cancelled')
- `upcoming` (optional): Filter for upcoming shows only ('true' or 'false')

### Example Requests

#### For a Fan user:
```bash
GET /api/live-shows/me/shows
Authorization: Bearer <fan_token>
```

#### For a Star user:
```bash
GET /api/live-shows/me/shows
Authorization: Bearer <star_token>
```

#### With query parameters:
```bash
GET /api/live-shows/me/shows?status=active&upcoming=true
Authorization: Bearer <user_token>
```

### Response Format

#### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "show_id",
      "sessionTitle": "Show Title",
      "date": "2024-01-15T10:00:00.000Z",
      "time": "10:00 AM",
      "attendanceFee": 50,
      "hostingPrice": 100,
      "maxCapacity": 20,
      "showCode": "ABC123",
      "inviteLink": "https://app.baroni.com/live/ABC123",
             "starId": {
         "id": "star_id",
         "baroniId": "BAR123456",
         "name": "Star Name",
         "pseudo": "star_pseudo",
         "profilePic": "profile_url",
         "availableForBookings": true,
         "about": "Star's bio and description",
         "location": "City, Country",
         "country": "Country Name",
         "preferredLanguage": "en",
         "coinBalance": 1500,
         "profession": {
           "id": "profession_id",
           "name": "Singer",
           "image": "profession_image_url"
         }
       },
      "status": "active",
      "currentAttendees": 5,
      "description": "Show description",
      "thumbnail": "thumbnail_url",
      "likeCount": 10,
      "isAtCapacity": false,
      "isUpcoming": true,
      "isFavorite": false,
      "hasJoined": true,
      "isLiked": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "role": "fan",
  "count": 1
}
```

#### Error Response (403)
```json
{
  "success": false,
  "message": "Access denied. Only fans and stars can access this endpoint."
}
```

#### Error Response (500)
```json
{
  "success": false,
  "message": "Internal server error"
}
```

### Notes
- The response includes user-specific flags like `isFavorite`, `hasJoined`, and `isLiked`
- Shows are sorted by date in descending order (newest first)
- The `role` field in the response indicates the user's role
- The `count` field shows the total number of shows returned
- **Enhanced Star Information**: The `starId` object now includes comprehensive star details:
  - `baroniId`: Unique Baroni identifier
  - `about`: Star's bio and description
  - `location`: Star's location
  - `country`: Star's country
  - `preferredLanguage`: Star's preferred language
  - `coinBalance`: Star's current coin balance
  - `profession`: Star's profession category with name and image
