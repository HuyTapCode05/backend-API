import express from 'express';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const testLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Test endpoint - List all available routes
router.get('/routes', testLimiter, async (req, res) => {
  try {
    const routes = {
      auth: {
        register: { method: 'POST', path: '/api/auth/register', description: 'Register new user' },
        login: { method: 'POST', path: '/api/auth/login', description: 'Login user' },
        refresh: { method: 'POST', path: '/api/auth/refresh', description: 'Refresh access token' },
        logout: { method: 'POST', path: '/api/auth/logout', description: 'Logout user' },
        verifyEmail: { method: 'POST', path: '/api/auth/verify-email', description: 'Verify email address' },
        resendVerification: { method: 'POST', path: '/api/auth/resend-verification', description: 'Resend verification email' },
        forgotPassword: { method: 'POST', path: '/api/auth/forgot-password', description: 'Request password reset' },
        resetPassword: { method: 'POST', path: '/api/auth/reset-password', description: 'Reset password' },
        getTokenInfo: { method: 'GET', path: '/api/auth/token/info', description: 'Get current token info', requiresAuth: true },
        getRefreshTokens: { method: 'GET', path: '/api/auth/token/refresh-tokens', description: 'Get all refresh tokens', requiresAuth: true }
      },
      apiKeys: {
        generate: { method: 'POST', path: '/api/keys/generate', description: 'Generate new API key', requiresAuth: true },
        list: { method: 'GET', path: '/api/keys/list', description: 'List all API keys', requiresAuth: true },
        delete: { method: 'DELETE', path: '/api/keys/:keyId', description: 'Delete API key', requiresAuth: true }
      },
      users: {
        me: { method: 'GET', path: '/api/users/me', description: 'Get current user info', requiresAuth: true },
        getUser: { method: 'GET', path: '/api/users/:userId', description: 'Get user by ID', requiresAuth: true },
        updateProfile: { method: 'PUT', path: '/api/users/me', description: 'Update current user profile', requiresAuth: true },
        uploadAvatar: { method: 'POST', path: '/api/users/me/avatar', description: 'Upload user avatar', requiresAuth: true },
        search: { method: 'GET', path: '/api/users/search/:query', description: 'Search users', requiresAuth: true }
      },
      message: {
        upload: { method: 'POST', path: '/api/message/upload', description: 'Upload file for message', requiresAuth: true },
        send: { method: 'POST', path: '/api/message/send', description: 'Send message', requiresAuth: true },
        getMessages: { method: 'GET', path: '/api/message/:roomId', description: 'Get messages in room', requiresAuth: true },
        updateMessage: { method: 'PUT', path: '/api/message/:messageId', description: 'Update message', requiresAuth: true },
        deleteMessage: { method: 'DELETE', path: '/api/message/:messageId', description: 'Delete message', requiresAuth: true },
        search: { method: 'GET', path: '/api/message/search', description: 'Search messages', requiresAuth: true }
      },
      groups: {
        create: { method: 'POST', path: '/api/groups', description: 'Create new group', requiresAuth: true },
        list: { method: 'GET', path: '/api/groups', description: 'List groups', requiresAuth: true },
        get: { method: 'GET', path: '/api/groups/:groupId', description: 'Get group by ID', requiresAuth: true },
        update: { method: 'PUT', path: '/api/groups/:groupId', description: 'Update group', requiresAuth: true },
        delete: { method: 'DELETE', path: '/api/groups/:groupId', description: 'Delete group', requiresAuth: true }
      },
      friends: {
        sendRequest: { method: 'POST', path: '/api/friends/request', description: 'Send friend request', requiresAuth: true },
        accept: { method: 'POST', path: '/api/friends/accept', description: 'Accept friend request', requiresAuth: true },
        reject: { method: 'POST', path: '/api/friends/reject', description: 'Reject friend request', requiresAuth: true },
        list: { method: 'GET', path: '/api/friends', description: 'List friends', requiresAuth: true }
      },
      notifications: {
        get: { method: 'GET', path: '/api/notifications', description: 'Get notifications', requiresAuth: true },
        markRead: { method: 'PUT', path: '/api/notifications/:notificationId/read', description: 'Mark notification as read', requiresAuth: true }
      }
    };

    return sendSuccess(res, {
      routes,
      note: 'Use POST for register, not GET!',
      testEndpoints: {
        health: 'GET /api/health',
        apiInfo: 'GET /api',
        testRoutes: 'GET /api/test/routes'
      }
    }, 'All available routes');
  } catch (error) {
    console.error('Test routes error:', error);
    return sendError(res, error, 'Failed to get routes', 500);
  }
});

// Test database connection
router.get('/db', testLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    return sendSuccess(res, {
      connected: true,
      collections: collectionNames,
      count: collectionNames.length
    }, 'Database connection test successful');
  } catch (error) {
    console.error('Test DB error:', error);
    return sendError(res, error, 'Database test failed', 500);
  }
});

export default router;

