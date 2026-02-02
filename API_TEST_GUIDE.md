# 🧪 API Test Guide - Hướng dẫn Test API

## ⚠️ Lưu ý quan trọng

**Register endpoint chỉ hỗ trợ POST, không phải GET!**

## 📋 Quick Test Guide

### 1. Authentication APIs

#### Register (POST)
```http
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123",
  "email": "test@example.com"
}
```

#### Login (POST)
```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

#### Get Token Info (GET)
```http
GET http://localhost:3000/api/auth/token/info
Authorization: Bearer <accessToken>
```

#### Get Refresh Tokens (GET)
```http
GET http://localhost:3000/api/auth/token/refresh-tokens
Authorization: Bearer <accessToken>
```

#### Refresh Token (POST)
```http
POST http://localhost:3000/api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

#### Logout (POST)
```http
POST http://localhost:3000/api/auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

### 2. API Keys Management

#### Generate API Key (POST)
```http
POST http://localhost:3000/api/keys/generate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "My API Key",
  "description": "For testing purposes"
}
```

#### List API Keys (GET)
```http
GET http://localhost:3000/api/keys/list
Authorization: Bearer <accessToken>
```

#### Delete API Key (DELETE)
```http
DELETE http://localhost:3000/api/keys/:keyId
Authorization: Bearer <accessToken>
```

### 3. User APIs

#### Get Current User (GET)
```http
GET http://localhost:3000/api/users/me
Authorization: Bearer <accessToken>
```

#### Update Profile (PUT)
```http
PUT http://localhost:3000/api/users/me
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "username": "newname",
  "email": "newemail@example.com"
}
```

### 4. Message APIs

#### Send Message (POST)
```http
POST http://localhost:3000/api/message/send
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "roomId": "room123",
  "text": "Hello @username!",
  "replyToMessageId": "optional_message_id"
}
```

#### Get Messages (GET)
```http
GET http://localhost:3000/api/message/room123?limit=50&skip=0
Authorization: Bearer <accessToken>
```

### 5. Test Endpoints

#### Health Check (GET)
```http
GET http://localhost:3000/api/health
```

#### API Info (GET)
```http
GET http://localhost:3000/api
```

## 🔑 Lấy Token để Test

1. **Đăng ký tài khoản mới:**
   ```bash
   POST /api/auth/register
   {
     "username": "testuser",
     "password": "password123",
     "email": "test@example.com"
   }
   ```

2. **Đăng nhập:**
   ```bash
   POST /api/auth/login
   {
     "username": "testuser",
     "password": "password123"
   }
   ```

3. **Copy `accessToken` từ response**

4. **Sử dụng token trong header:**
   ```
   Authorization: Bearer <accessToken>
   ```

## 📝 Hoppscotch Collection

Import vào Hoppscotch để test nhanh:

1. Mở Hoppscotch
2. Click "Nhập" (Import)
3. Copy JSON collection bên dưới

## ⚡ Quick Test Script

```javascript
// Test trong browser console hoặc Node.js

// 1. Register
fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'testuser',
    password: 'password123',
    email: 'test@example.com'
  })
})
.then(r => r.json())
.then(data => {
  console.log('Register:', data);
  return data.data.accessToken;
})
.then(token => {
  // 2. Get Token Info
  return fetch('http://localhost:3000/api/auth/token/info', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
})
.then(r => r.json())
.then(data => console.log('Token Info:', data));
```

## 🐛 Troubleshooting

### 404 Not Found
- ✅ Kiểm tra server đang chạy: `netstat -ano | findstr :3000`
- ✅ Kiểm tra đúng HTTP method (POST/GET/PUT/DELETE)
- ✅ Kiểm tra đúng URL path

### 401 Unauthorized
- ✅ Kiểm tra token còn hạn
- ✅ Kiểm tra header: `Authorization: Bearer <token>`
- ✅ Token phải có khoảng trắng sau "Bearer"

### 500 Server Error
- ✅ Kiểm tra MongoDB đang chạy
- ✅ Kiểm tra console logs của server
- ✅ Kiểm tra database connection

