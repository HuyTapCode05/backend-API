import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId, sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const starLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

async function assertCanAccessMessage(db, message, userId) {
  if (message?.roomId && isValidObjectId(message.roomId)) {
    const group = await db.collection('groups').findOne({ _id: new ObjectId(message.roomId) });
    if (group) {
      const isMember = group.members?.some(m => m.userId === userId);
      if (!isMember) {
        return { ok: false, status: 403, error: 'Access denied' };
      }
      return { ok: true };
    }
  }

  if (message.userId !== userId) {
    return { ok: false, status: 403, error: 'Access denied' };
  }
  return { ok: true };
}

router.post('/:messageId/star', verifyToken, starLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!ObjectId.isValid(messageId)) {
      return sendError(res, 'Invalid message ID', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const message = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });
    if (!message) {
      return sendError(res, 'Message not found', 'Not found', 404);
    }

    const access = await assertCanAccessMessage(db, message, req.userId);
    if (!access.ok) {
      return sendError(res, access.error, 'Forbidden', access.status);
    }

    const record = {
      userId: req.userId,
      messageId: messageId,
      roomId: sanitizeString(message.roomId || ''),
      starredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection('starred_messages').updateOne(
      { userId: req.userId, messageId: messageId },
      {
        $setOnInsert: {
          createdAt: record.createdAt,
          starredAt: record.starredAt,
        },
        $set: {
          roomId: record.roomId,
          updatedAt: record.updatedAt,
        },
      },
      { upsert: true }
    );

    return sendSuccess(res, { messageId, isStarred: true }, 'Message starred successfully');
  } catch (error) {
    console.error('Star message error:', error);
    return sendError(res, error, 'Failed to star message', 500);
  }
});

router.delete('/:messageId/star', verifyToken, starLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!ObjectId.isValid(messageId)) {
      return sendError(res, 'Invalid message ID', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const result = await db.collection('starred_messages').deleteOne({
      userId: req.userId,
      messageId: messageId,
    });

    if (result.deletedCount === 0) {
      return sendError(res, 'Message is not starred', 'Not found', 404);
    }

    return sendSuccess(res, { messageId, isStarred: false }, 'Message unstarred successfully');
  } catch (error) {
    console.error('Unstar message error:', error);
    return sendError(res, error, 'Failed to unstar message', 500);
  }
});

router.get('/starred', verifyToken, starLimiter, async (req, res) => {
  try {
    const { limit = 50, skip = 0, roomId } = req.query;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const q = { userId: req.userId };
    if (roomId && typeof roomId === 'string' && roomId.trim().length > 0) {
      q.roomId = sanitizeString(roomId);
    }

    const stars = await db.collection('starred_messages')
      .find(q)
      .sort({ starredAt: -1 })
      .limit(Math.min(parseInt(limit), 100))
      .skip(Math.max(parseInt(skip), 0))
      .toArray();

    const ids = stars
      .map(s => s.messageId)
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const messages = await db.collection('messages')
      .find({ _id: { $in: ids } })
      .project({ password: 0 })
      .toArray();

    const msgById = new Map(messages.map(m => [m._id.toString(), m]));

    const items = stars.map(s => ({
      messageId: s.messageId,
      roomId: s.roomId,
      starredAt: s.starredAt,
      message: msgById.get(s.messageId) || null,
    }));

    return sendSuccess(res, { items, total: items.length }, 'Starred messages retrieved successfully');
  } catch (error) {
    console.error('Get starred messages error:', error);
    return sendError(res, error, 'Failed to get starred messages', 500);
  }
});

export default router;