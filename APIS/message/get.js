import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const getMessagesLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/:roomId', verifyToken, getMessagesLimiter, async (req, res) => {
  try {
    let { roomId } = req.params;
    const { limit = 50, skip = 0, before } = req.query;

    roomId = sanitizeString(roomId);
    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const query = { roomId };
    if (before) {
      query.createdAt = { $lt: before };
    }

    const messages = await db.collection('messages')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    messages.reverse();

    const userIds = [...new Set(messages.map(m => m.userId))];
    const users = await db.collection('users')
      .find({ _id: { $in: userIds.map(id => new ObjectId(id)) } })
      .project({ password: 0 })
      .toArray();

    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar,
        email: user.email
      };
    });

    const enrichedMessages = messages.map(msg => ({
      ...msg,
      user: userMap[msg.userId] || {
        userId: msg.userId,
        username: msg.username,
        avatar: msg.userAvatar
      }
    }));

    return sendSuccess(res, {
      messages: enrichedMessages,
      total: enrichedMessages.length,
      hasMore: enrichedMessages.length === parseInt(limit)
    }, 'Messages retrieved successfully');
  } catch (error) {
    console.error('Get messages error:', error);
    return sendError(res, error, 'Failed to get messages', 500);
  }
});

export default router;

