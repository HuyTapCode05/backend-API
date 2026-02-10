import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, sanitizeString } from '../utils/validation.js';
import { assertRoomUnlocked } from '../utils/groupLock.js';
import { assertPinVerified, isRoomHiddenForUser } from '../utils/userPin.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const exportLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: 'Too many export requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/export/room/:roomId', verifyToken, exportLimiter, async (req, res) => {
  try {
    let { roomId } = req.params;
    const {
      from,
      to,
      limit = 1000,
      skip = 0,
      direction = 'asc',
      includeSystem = 'true',
    } = req.query;

    roomId = sanitizeString(roomId);
    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const unlockCheck = await assertRoomUnlocked(db, roomId, req.userId);
    if (!unlockCheck.ok) {
      return sendError(res, unlockCheck.error, 'Locked', unlockCheck.status);
    }

    const hidden = await isRoomHiddenForUser(req.userId, roomId);
    if (hidden) {
      const ok = await assertPinVerified(req, res);
      if (!ok) return;
    }

    const query = { roomId };

    if (from || to) {
      query.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) {
          return sendError(res, 'Invalid from date format. Use ISO 8601.', 'Validation error', 400);
        }
        query.createdAt.$gte = fromDate.toISOString();
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate.getTime())) {
          return sendError(res, 'Invalid to date format. Use ISO 8601.', 'Validation error', 400);
        }
        query.createdAt.$lte = toDate.toISOString();
      }
      if (Object.keys(query.createdAt).length === 0) {
        delete query.createdAt;
      }
    }

    if (includeSystem === 'false') {
      query.messageType = { $ne: 'system' };
    }

    const limitNum = Math.min(parseInt(limit) || 1000, 5000);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    const sortDirection = direction === 'desc' ? -1 : 1;

    const messages = await db
      .collection('messages')
      .find(query)
      .sort({ createdAt: sortDirection })
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const userIds = [...new Set(messages.map((m) => m.userId).filter(Boolean))];
    let userMap = {};

    if (userIds.length > 0) {
      const users = await db
        .collection('users')
        .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
        .project({ password: 0 })
        .toArray();

      users.forEach((user) => {
        userMap[user._id.toString()] = {
          userId: user._id.toString(),
          username: user.username,
          avatar: user.avatar,
          email: user.email,
        };
      });
    }

    const exportMessages = messages.map((msg) => ({
      id: msg._id.toString(),
      roomId: msg.roomId,
      userId: msg.userId,
      user: userMap[msg.userId] || {
        userId: msg.userId,
        username: msg.username,
        avatar: msg.userAvatar,
      },
      text: msg.text || '',
      messageType: msg.messageType || 'text',
      fileUrl: msg.fileUrl || null,
      fileType: msg.fileType || null,
      source: msg.source || 'web',
      mentions: msg.mentions || [],
      replyToMessageId: msg.replyToMessageId || null,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt || msg.createdAt,
      isEdited: !!msg.isEdited,
      isPinned: !!msg.isPinned,
      isStarred: !!msg.isStarred,
      isRecalled: !!msg.isRecalled,
    }));

    const totalCount = await db.collection('messages').countDocuments(query);

    return sendSuccess(
      res,
      {
        roomId,
        total: totalCount,
        returned: exportMessages.length,
        hasMore: skipNum + limitNum < totalCount,
        filters: {
          from: from || null,
          to: to || null,
          includeSystem: includeSystem !== 'false',
          direction,
        },
        messages: exportMessages,
      },
      'Messages exported successfully'
    );
  } catch (error) {
    console.error('Export messages error:', error);
    return sendError(res, error, 'Failed to export messages', 500);
  }
});

export default router;


