import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { verifyToken } from '../../Auth/middleware.js';
import { isValidObjectId } from '../../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const repliesLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:messageId/replies', verifyToken, repliesLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    if (!isValidObjectId(messageId)) {
      return sendError(res, 'Invalid message ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const originalMessage = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    if (!originalMessage) {
      return sendError(res, 'Message not found', 'Not found', 404);
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    const replies = await db.collection('messages')
      .find({ replyToMessageId: messageId })
      .sort({ createdAt: 1 })
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const userIds = [...new Set(replies.map(r => r.userId))];
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

    const enrichedReplies = replies.map(reply => ({
      ...reply,
      user: userMap[reply.userId] || {
        userId: reply.userId,
        username: reply.username,
        avatar: reply.userAvatar
      }
    }));

    const totalCount = await db.collection('messages').countDocuments({ replyToMessageId: messageId });

    return sendSuccess(res, {
      originalMessage: {
        _id: originalMessage._id.toString(),
        userId: originalMessage.userId,
        username: originalMessage.username,
        text: originalMessage.text,
        messageType: originalMessage.messageType,
        createdAt: originalMessage.createdAt
      },
      replies: enrichedReplies,
      total: totalCount,
      returned: enrichedReplies.length,
      hasMore: (skipNum + limitNum) < totalCount
    }, 'Replies retrieved successfully');
  } catch (error) {
    console.error('Get replies error:', error);
    return sendError(res, error, 'Failed to get replies', 500);
  }
});

export default router;

