import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { verifyToken } from '../../Auth/middleware.js';
import { isValidObjectId } from '../../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const readReceiptsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:messageId/read-status', verifyToken, readReceiptsLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!isValidObjectId(messageId)) {
      return sendError(res, 'Invalid message ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const message = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    if (!message) {
      return sendError(res, 'Message not found', 'Not found', 404);
    }

    const receipts = await db.collection('read_receipts')
      .find({ messageId: messageId })
      .toArray();

    const userIds = receipts.map(r => r.userId);
    const users = await db.collection('users')
      .find({ _id: { $in: userIds.map(id => new ObjectId(id)) } })
      .project({ password: 0, username: 1, avatar: 1 })
      .toArray();

    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar
      };
    });

    const readBy = receipts.map(r => ({
      user: userMap[r.userId] || { userId: r.userId },
      readAt: r.readAt
    }));

    const myReadStatus = receipts.find(r => r.userId === req.userId);

    return sendSuccess(res, {
      messageId: messageId,
      readCount: receipts.length,
      readBy: readBy,
      myReadStatus: myReadStatus ? {
        read: true,
        readAt: myReadStatus.readAt
      } : {
        read: false,
        readAt: null
      }
    }, 'Read status retrieved successfully');
  } catch (error) {
    console.error('Get read status error:', error);
    return sendError(res, error, 'Failed to get read status', 500);
  }
});

router.get('/room/:roomId/unread-count', verifyToken, readReceiptsLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const messages = await db.collection('messages')
      .find({ roomId: roomId })
      .project({ _id: 1 })
      .toArray();

    const messageIds = messages.map(m => m._id.toString());

    const readReceipts = await db.collection('read_receipts')
      .find({
        messageId: { $in: messageIds },
        userId: req.userId
      })
      .toArray();

    const readMessageIds = new Set(readReceipts.map(r => r.messageId));
    const unreadCount = messageIds.length - readMessageIds.size;

    return sendSuccess(res, {
      roomId: roomId,
      totalMessages: messageIds.length,
      readMessages: readMessageIds.size,
      unreadCount: unreadCount
    }, 'Unread count retrieved successfully');
  } catch (error) {
    console.error('Get unread count error:', error);
    return sendError(res, error, 'Failed to get unread count', 500);
  }
});

export default router;

