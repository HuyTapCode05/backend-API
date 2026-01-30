# 💬 Real-time Chat Application API

Ứng dụng chat real-time với MongoDB và WebSocket, hoàn chỉnh với authentication, file upload, và real-time messaging.

## ✨ Tính năng

- ✅ **Authentication System** - Đăng ký, đăng nhập, JWT tokens, email verification, password reset
- ✅ **Real-time Messaging** - Gửi/nhận tin nhắn real-time qua WebSocket
- ✅ **Multiple Rooms** - Hỗ trợ nhiều phòng chat
- ✅ **File Upload** - Upload ảnh, video, voice, sticker, avatar
- ✅ **User Management** - Profile, avatar, search users
- ✅ **Message Management** - Send, get, update, delete messages
- ✅ **User Presence** - Hiển thị users đang online
- ✅ **Typing Indicators** - Hiển thị khi ai đó đang gõ
- ✅ **Security** - Input validation, sanitization, IDOR protection, rate limiting
- ✅ **REST API** - API endpoints đầy đủ cho mobile app

## 📋 Yêu cầu

- Node.js (v18 trở lên)
- MongoDB (localhost:27017 hoặc MongoDB Atlas)

## 🚀 Cài đặt

### 1. Clone repository
```bash
git clone https://github.com/HuyTapCode05/backend-API.git
cd backend-API
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình Environment Variables

Tạo file `.env`:
```env
# Server Configuration
PORT=3000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017
DB_NAME=chat_app

# JWT Secret Key (Change this in production!)
JWT_SECRET=your-secret-key-change-in-production

# Email Configuration (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

### 4. Khởi động server
```bash
npm start
```

Hoặc chạy ở chế độ development:
```bash
npm run dev
```

Server sẽ chạy tại: `http://localhost:3000`

## 📡 API Endpoints

### Authentication

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "password": "password123",
  "email": "john@example.com"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "username": "john_doe",
      "email": "john@example.com",
      "avatar": null,
      "emailVerified": false
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful"
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Verify Email
```http
POST /api/auth/verify-email
Content-Type: application/json

{
  "code": "123456"
}
```

#### Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}
```

#### Reset Password
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "code": "123456",
  "newPassword": "newpassword123"
}
```

### Users

#### Get Current User
```http
GET /api/users/me
Authorization: Bearer {accessToken}
```

#### Get User by ID
```http
GET /api/users/:userId
Authorization: Bearer {accessToken}
```

#### Update Profile
```http
PUT /api/users/me
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "username": "new_username",
  "email": "newemail@example.com"
}
```

#### Upload Avatar
```http
POST /api/users/me/avatar
Authorization: Bearer {accessToken}
Content-Type: multipart/form-data

file: [avatar image]
```

#### Search Users
```http
GET /api/users/search/:query?limit=20
Authorization: Bearer {accessToken}
```

### Messages

#### Upload File
```http
POST /api/message/upload
Authorization: Bearer {accessToken}
Content-Type: multipart/form-data

file: [file]
fileType: chat|avatar|sticker|video|voice|emg
```

#### Send Message
```http
POST /api/message/send
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "roomId": "general",
  "text": "Hello everyone!",
  "fileUrl": "/Uploads/Images/Chat/image-123.jpg",
  "fileType": "chat",
  "messageType": "text",
  "source": "app"
}
```

#### Get Messages
```http
GET /api/message/:roomId?limit=50&skip=0&before=2024-01-01T00:00:00.000Z
Authorization: Bearer {accessToken}
```

#### Update Message
```http
PUT /api/message/:messageId
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "text": "Updated message text"
}
```

#### Delete Message
```http
DELETE /api/message/:messageId
Authorization: Bearer {accessToken}
```

## 🔌 WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000');
```

### Join Room
```json
{
  "type": "join",
  "payload": {
    "username": "john_doe",
    "roomId": "general"
  }
}
```

### Send Message
```json
{
  "type": "message",
  "payload": {
    "text": "Hello everyone!",
    "fileUrl": "/Uploads/Images/Chat/image.jpg",
    "fileType": "chat",
    "messageType": "text",
    "source": "web"
  }
}
```

### Typing Indicator
```json
{
  "type": "typing",
  "payload": {
    "isTyping": true
  }
}
```

### Leave Room
```json
{
  "type": "leave"
}
```

### Server Events

#### New Message
```json
{
  "type": "new_message",
  "data": {
    "_id": "...",
    "userId": "...",
    "username": "john_doe",
    "roomId": "general",
    "text": "Hello!",
    "fileUrl": null,
    "fileType": null,
    "messageType": "text",
    "source": "web",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "user": {
      "userId": "...",
      "username": "john_doe",
      "avatar": null,
      "email": "john@example.com"
    }
  }
}
```

#### User Joined
```json
{
  "type": "user_joined",
  "data": {
    "userId": "...",
    "username": "john_doe",
    "roomId": "general"
  }
}
```

#### User Left
```json
{
  "type": "user_left",
  "data": {
    "userId": "...",
    "username": "john_doe"
  }
}
```

#### User Typing
```json
{
  "type": "user_typing",
  "data": {
    "userId": "...",
    "username": "john_doe",
    "isTyping": true
  }
}
```

## 🔧 Cấu trúc Database

### Collections

#### users
```javascript
{
  _id: ObjectId,
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  avatar: String (url),
  emailVerified: Boolean,
  locked: Boolean,
  disabled: Boolean,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

#### messages
```javascript
{
  _id: ObjectId,
  userId: String,
  username: String,
  userAvatar: String,
  roomId: String,
  text: String,
  fileUrl: String,
  fileType: String, // chat, avatar, sticker, video, voice, emg
  messageType: String, // text, file, image, video, voice, sticker
  source: String, // app, web, api
  createdAt: ISOString,
  updatedAt: ISOString
}
```

#### rooms
```javascript
{
  _id: ObjectId,
  name: String (unique),
  description: String,
  createdAt: ISOString,
  userCount: Number
}
```

#### refresh_tokens
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  token: String (unique),
  createdAt: ISOString
}
```

#### email_verifications
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  email: String,
  token: String (unique),
  code: String,
  createdAt: ISOString
}
```

#### password_resets
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  email: String,
  token: String (unique),
  code: String,
  createdAt: ISOString
}
```

## 🛡️ Security Features

- ✅ **JWT Authentication** - Access tokens và refresh tokens
- ✅ **Input Validation** - Sanitize và validate tất cả input
- ✅ **IDOR Protection** - Chỉ chủ sở hữu mới có thể sửa/xóa message
- ✅ **Rate Limiting** - Giới hạn số request để chống brute-force
- ✅ **Password Hashing** - Bcrypt với salt rounds
- ✅ **Email Verification** - Xác thực email khi đăng ký
- ✅ **Session Management** - Invalidate tokens khi đổi password
- ✅ **CORS** - Cross-Origin Resource Sharing enabled

## 📁 Cấu trúc Project

```
backend-API/
├── APIS/
│   ├── Auth/
│   │   ├── index.js
│   │   ├── login.js
│   │   ├── register.js
│   │   ├── emailVerification.js
│   │   ├── passwordReset.js
│   │   ├── token.js
│   │   └── middleware.js
│   ├── users/
│   │   ├── index.js
│   │   ├── profile.js
│   │   ├── avatar.js
│   │   └── search.js
│   ├── message/
│   │   ├── index.js
│   │   ├── upload.js
│   │   ├── send.js
│   │   ├── get.js
│   │   └── update.js
│   └── utils/
│       ├── response.js
│       └── validation.js
├── config/
│   ├── database.js
│   ├── email.js
│   └── websocket.js
├── Uploads/
│   ├── Images/
│   │   ├── Avatar/
│   │   ├── Chat/
│   │   ├── sticker/
│   │   └── emg/
│   ├── Video/
│   └── Voice/
├── index.js
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🚀 Deployment

### Environment Variables cho Production

```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://...
DB_NAME=chat_app
JWT_SECRET=your-very-secure-secret-key-here
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

## 📝 Notes

- Server tự động tạo indexes cho performance tốt hơn
- WebSocket tự động reconnect khi mất kết nối
- Messages được lưu vào MongoDB để có thể query sau
- Hỗ trợ nhiều rooms đồng thời
- Real-time user presence tracking
- File uploads được lưu trong thư mục `Uploads/`

## 🐛 Troubleshooting

**Lỗi kết nối MongoDB:**
- Đảm bảo MongoDB đang chạy
- Kiểm tra MongoDB URI trong `.env`

**WebSocket không kết nối:**
- Kiểm tra port 3000 có bị chiếm không
- Xem console log của server

**Email không gửi được:**
- Kiểm tra email credentials trong `.env`
- Đảm bảo đã tạo App Password cho Gmail
- Xem file `EMAIL_SETUP.md` để hướng dẫn chi tiết

**Messages không hiển thị:**
- Kiểm tra WebSocket connection status
- Xem Network tab trong DevTools
- Đảm bảo đã join room trước khi gửi message

## 📄 License

MIT

## 👤 Author

HuyTapCode05

## 🔗 Links

- Repository: https://github.com/HuyTapCode05/backend-API
