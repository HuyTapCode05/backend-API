import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { verifyToken } from '../../Auth/middleware.js';
import { isValidObjectId } from '../../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const mentionsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Get all messages where current user is mentioned
router.get('/me', verifyToken, mentionsLimiter, async (req, res) => {
  try {
    const { limit = 50, skip = 0, roomId } = req.query;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { username: 1 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    // Build query: messages where current user is mentioned
    const query = {
      'mentions.userId': req.userId
    };

    if (roomId) {
      query.roomId = roomId;
    }

    const messages = await db.collection('messages')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skipNum)
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

    const totalCount = await db.collection('messages').countDocuments(query);

    return sendSuccess(res, {
      messages: enrichedMessages,
      total: totalCount,
      returned: enrichedMessages.length,
      hasMore: (skipNum + limitNum) < totalCount
    }, 'Mentions retrieved successfully');
  } catch (error) {
    console.error('Get mentions error:', error);
    return sendError(res, error, 'Failed to get mentions', 500);
  }
});

// Get messages in a room where a specific user is mentioned
router.get('/room/:roomId/user/:userId', verifyToken, mentionsLimiter, async (req, res) => {
  try {
    const { roomId, userId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    if (!isValidObjectId(userId)) {
      return sendError(res, 'Invalid user ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    const messages = await db.collection('messages')
      .find({
        roomId: roomId,
        'mentions.userId': userId
      })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skipNum)
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

    const totalCount = await db.collection('messages').countDocuments({
      roomId: roomId,
      'mentions.userId': userId
    });

    return sendSuccess(res, {
      messages: enrichedMessages,
      total: totalCount,
      returned: enrichedMessages.length,
      hasMore: (skipNum + limitNum) < totalCount
    }, 'Mentions retrieved successfully');
  } catch (error) {
    console.error('Get mentions error:', error);
    return sendError(res, error, 'Failed to get mentions', 500);
  }
});

export default router;

