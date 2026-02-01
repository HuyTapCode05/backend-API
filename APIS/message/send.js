import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, validateText, sanitizeString, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many messages, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});
router.post('/send', verifyToken, messageLimiter, async (req, res) => {
  try {
    const allowedFields = ['roomId', 'text', 'fileUrl', 'fileType', 'messageType', 'source'];
    const body = whitelistObject(req.body, allowedFields);
    let { roomId, text, fileUrl, fileType, messageType, source } = body;

    if (!roomId) {
      return sendError(res, 'RoomId is required', 'Validation error', 400);
    }
    roomId = sanitizeString(roomId);
    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    if (!text && !fileUrl) {
      return sendError(res, 'Text or fileUrl is required', 'Validation error', 400);
    }

    if (text) {
      try {
        text = validateText(text, 10000);
      } catch (error) {
        return sendError(res, error.message, 'Validation error', 400);
      }
    }

    if (fileUrl) {
      fileUrl = sanitizeString(fileUrl);
      if (!fileUrl.startsWith('/') && !fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
        return sendError(res, 'Invalid file URL format', 'Validation error', 400);
      }
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const blockedCheck = await db.collection('blocked_users').findOne({
      $or: [
        { userId: req.userId, blockedUserId: roomId },
        { userId: roomId, blockedUserId: req.userId }
      ]
    });

    if (blockedCheck) {
      return sendError(res, 'Cannot send message. User is blocked.', 'Forbidden', 403);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const validSources = ['app', 'web', 'api'];
    const messageSource = source && validSources.includes(source.toLowerCase()) 
      ? source.toLowerCase() 
      : 'web';

    const message = {
      _id: new ObjectId(),
      userId: req.userId,
      username: user.username,
      userAvatar: user.avatar || null,
      roomId: roomId,
      text: text || '',
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      messageType: messageType || (fileUrl ? 'file' : 'text'),
      source: messageSource,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        userId: req.userId,
        username: user.username,
        avatar: user.avatar || null,
        email: user.email || null
      }
    };

    await db.collection('messages').insertOne(message);

    return sendSuccess(res, message, 'Message sent successfully');
  } catch (error) {
    console.error('Send message error:', error);
    return sendError(res, error, 'Failed to send message', 500);
  }
});

export default router;

