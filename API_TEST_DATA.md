# 🧪 API Test Data - Copy & Paste

File này chứa các ví dụ data để test API nhanh. Copy và paste vào Hoppscotch hoặc Postman.

---

## 🔐 Authentication APIs

### 1. Register (POST)
```http
POST http://localhost:3000/api/auth/register
Content-Type: application/json
```

**Body:**
```json
{
  "username": "testuser",
  "password": "password123",
  "email": "test@example.com"
}
```

**Response mẫu:**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "username": "testuser",
      "email": "test@example.com"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "verificationCode": "123456"
  }
}
```

---

### 2. Login (POST)
```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json
```

**Body:**
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**Hoặc dùng email:**
```json
{
  "username": "test@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "username": "testuser",
      "email": "test@example.com"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

**💡 Copy token này để dùng cho các API khác!**

---

### 3. Refresh Token (POST)
```http
POST http://localhost:3000/api/auth/refresh
Content-Type: application/json
```

**Body:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

---

### 4. Logout (POST)
```http
POST http://localhost:3000/api/auth/logout
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

---

### 5. Verify Email (POST)
```http
POST http://localhost:3000/api/auth/verify-email
Content-Type: application/json
```

**Body (dùng code):**
```json
{
  "code": "123456"
}
```

**Body (dùng token):**
```json
{
  "token": "eyJhbGc..."
}
```

---

### 6. Forgot Password (POST)
```http
POST http://localhost:3000/api/auth/forgot-password
Content-Type: application/json
```

**Body:**
```json
{
  "email": "test@example.com"
}
```

---

### 7. Reset Password (POST)
```http
POST http://localhost:3000/api/auth/reset-password
Content-Type: application/json
```

**Body (dùng code):**
```json
{
  "email": "test@example.com",
  "code": "123456",
  "newPassword": "newpassword123"
}
```

**Body (dùng token):**
```json
{
  "token": "eyJhbGc...",
  "newPassword": "newpassword123"
}
```

---

## 👤 User APIs

### 8. Get Current User (GET)
```http
GET http://localhost:3000/api/users/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 9. Get User by ID (GET)
```http
GET http://localhost:3000/api/users/USER_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 10. Update Profile (PUT)
```http
PUT http://localhost:3000/api/users/me
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "username": "newname",
  "email": "newemail@example.com"
}
```

---

### 11. Upload Avatar (POST)
```http
POST http://localhost:3000/api/users/me/avatar
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**
- Key: `avatar`
- Type: File
- Value: [Chọn file ảnh]

---

### 12. Search Users (GET)
```http
GET http://localhost:3000/api/users/search/test?limit=20
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 13. Update Status (PUT)
```http
PUT http://localhost:3000/api/users/status
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "status": "online"
}
```

**Status options:** `online`, `offline`, `away`, `busy`

---

### 14. Get User Status (GET)
```http
GET http://localhost:3000/api/users/USER_ID_HERE/status
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 15. Get Friends Status (GET)
```http
GET http://localhost:3000/api/users/friends/status
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 💬 Message APIs

### 16. Upload File (POST)
```http
POST http://localhost:3000/api/message/upload
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**
- Key: `file`
- Type: File
- Value: [Chọn file]

---

### 17. Send Message (POST)
```http
POST http://localhost:3000/api/message/send
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body (text message):**
```json
{
  "roomId": "room123",
  "text": "Hello world!"
}
```

**Body (với file):**
```json
{
  "roomId": "room123",
  "text": "Check this out!",
  "fileUrl": "/Uploads/Images/Chat/filename.jpg",
  "fileType": "image",
  "messageType": "file"
}
```

**Body (reply to message):**
```json
{
  "roomId": "room123",
  "text": "This is a reply",
  "replyToMessageId": "MESSAGE_ID_HERE"
}
```

**Body (với mention):**
```json
{
  "roomId": "room123",
  "text": "Hey @username check this out!"
}
```

---

### 18. Get Messages (GET)
```http
GET http://localhost:3000/api/message/room123?limit=50&skip=0
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 19. Update Message (PUT)
```http
PUT http://localhost:3000/api/message/MESSAGE_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "text": "Updated message text"
}
```

---

### 20. Delete Message (DELETE)
```http
DELETE http://localhost:3000/api/message/MESSAGE_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 21. Search Messages (GET)
```http
GET http://localhost:3000/api/message/search?q=hello&limit=20
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 22. Advanced Search (GET)
```http
GET http://localhost:3000/api/message/search/advanced?q=hello&roomId=room123&userId=USER_ID&limit=20
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 23. Get Message Replies (GET)
```http
GET http://localhost:3000/api/message/MESSAGE_ID_HERE/replies?limit=50&skip=0
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 24. Get My Mentions (GET)
```http
GET http://localhost:3000/api/message/mentions/me?limit=50&skip=0
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 25. Add Reaction (POST)
```http
POST http://localhost:3000/api/message/MESSAGE_ID_HERE/reaction
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "emoji": "👍"
}
```

---

### 26. Remove Reaction (DELETE)
```http
DELETE http://localhost:3000/api/message/MESSAGE_ID_HERE/reaction?emoji=👍
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 27. Get Reactions (GET)
```http
GET http://localhost:3000/api/message/MESSAGE_ID_HERE/reactions
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 28. Mark Message as Read (POST)
```http
POST http://localhost:3000/api/message/MESSAGE_ID_HERE/read
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 29. Mark All as Read (POST)
```http
POST http://localhost:3000/api/message/room/room123/read-all
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 30. Get Read Status (GET)
```http
GET http://localhost:3000/api/message/MESSAGE_ID_HERE/read-status
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 👥 Group APIs

### 31. Create Group (POST)
```http
POST http://localhost:3000/api/groups
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "name": "My Group",
  "description": "Group description",
  "isPrivate": false
}
```

---

### 32. List Groups (GET)
```http
GET http://localhost:3000/api/groups?type=my&limit=50&skip=0
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Type options:** `all`, `my`, `public`, `owned`

---

### 33. Get Group (GET)
```http
GET http://localhost:3000/api/groups/GROUP_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 34. Update Group (PUT)
```http
PUT http://localhost:3000/api/groups/GROUP_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Updated Group Name",
  "description": "Updated description",
  "isPrivate": true
}
```

---

### 35. Delete Group (DELETE)
```http
DELETE http://localhost:3000/api/groups/GROUP_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 36. Get Group Members (GET)
```http
GET http://localhost:3000/api/groups/GROUP_ID_HERE/members
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 37. Add Member (POST)
```http
POST http://localhost:3000/api/groups/GROUP_ID_HERE/members
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "USER_ID_HERE"
}
```

---

### 38. Remove Member (DELETE)
```http
DELETE http://localhost:3000/api/groups/GROUP_ID_HERE/members/USER_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 39. Promote Member (POST)
```http
POST http://localhost:3000/api/groups/GROUP_ID_HERE/members/USER_ID_HERE/promote
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 40. Demote Admin (POST)
```http
POST http://localhost:3000/api/groups/GROUP_ID_HERE/members/USER_ID_HERE/demote
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 👫 Friends APIs

### 41. Send Friend Request (POST)
```http
POST http://localhost:3000/api/friends/request
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "USER_ID_HERE"
}
```

---

### 42. Accept Friend Request (POST)
```http
POST http://localhost:3000/api/friends/accept
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "requestId": "REQUEST_ID_HERE"
}
```

---

### 43. Reject Friend Request (POST)
```http
POST http://localhost:3000/api/friends/reject
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "requestId": "REQUEST_ID_HERE"
}
```

---

### 44. Get Friend Requests (GET)
```http
GET http://localhost:3000/api/friends/requests?type=sent&limit=50
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Type options:** `sent`, `received`, `all`

---

### 45. List Friends (GET)
```http
GET http://localhost:3000/api/friends?limit=50&skip=0
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 46. Remove Friend (DELETE)
```http
DELETE http://localhost:3000/api/friends/FRIEND_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 🔔 Notifications APIs

### 47. Get Notifications (GET)
```http
GET http://localhost:3000/api/notifications?limit=50&skip=0&unreadOnly=false&type=mention
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 48. Mark Notification as Read (PUT)
```http
PUT http://localhost:3000/api/notifications/NOTIFICATION_ID_HERE/read
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 49. Mark All as Read (PUT)
```http
PUT http://localhost:3000/api/notifications/read-all
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 🚫 Block Users APIs

### 50. Block User (POST)
```http
POST http://localhost:3000/api/users/block
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "USER_ID_HERE"
}
```

---

### 51. Unblock User (POST)
```http
POST http://localhost:3000/api/users/unblock
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "USER_ID_HERE"
}
```

---

### 52. Get Blocked Users (GET)
```http
GET http://localhost:3000/api/users/blocked?limit=50&skip=0
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

### 53. Check Block Status (GET)
```http
GET http://localhost:3000/api/users/check/USER_ID_HERE
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 🔍 Utility APIs

### 54. Health Check (GET)
```http
GET http://localhost:3000/api/health
```

---

### 55. API Info (GET)
```http
GET http://localhost:3000/api
```

---

## 📝 Quick Test Flow

### Bước 1: Register
```json
POST http://localhost:3000/api/auth/register
{
  "username": "testuser",
  "password": "password123",
  "email": "test@example.com"
}
```

### Bước 2: Login
```json
POST http://localhost:3000/api/auth/login
{
  "username": "testuser",
  "password": "password123"
}
```

### Bước 3: Copy Access Token
Từ response, copy `accessToken`

### Bước 4: Test với Token
```http
GET http://localhost:3000/api/users/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 💡 Tips

1. **Lưu token:** Sau khi login, copy `accessToken` và dùng cho tất cả API cần authentication
2. **Replace placeholders:** Thay `YOUR_ACCESS_TOKEN`, `USER_ID_HERE`, `MESSAGE_ID_HERE` bằng giá trị thực
3. **Check response:** Luôn kiểm tra `success: true/false` trong response
4. **Error handling:** Nếu `statusCode: 401`, token đã hết hạn, cần login lại
5. **Rate limiting:** Một số API có rate limit, đợi vài giây nếu gặp lỗi 429

---

## 🎯 Common Headers

**Với Authentication:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Không cần Authentication:**
```
Content-Type: application/json
```

---

**Happy Testing! 🚀**

