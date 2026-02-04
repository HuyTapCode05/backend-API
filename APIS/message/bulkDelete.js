import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const bulkDeleteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: 'Too many bulk delete requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/bulk-delete', verifyToken, bulkDeleteLimiter, async (req, res) => {
  try {
    const { messageIds, roomId } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return sendError(res, 'messageIds array is required', 'Validation error', 400);
    }

    if (messageIds.length > 100) {
      return sendError(res, 'Cannot delete more than 100 messages at once', 'Validation error', 400);
    }

    if (roomId) {
      const sanitizedRoomId = sanitizeString(roomId);
      if (!isValidRoomId(sanitizedRoomId)) {
        return sendError(res, 'Invalid room ID format', 'Validation error', 400);
      }
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const validMessageIds = messageIds
      .filter(id => id && ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    if (validMessageIds.length === 0) {
      return sendError(res, 'No valid message IDs provided', 'Validation error', 400);
    }

    const query = {
      _id: { $in: validMessageIds },
      userId: req.userId
    };

    if (roomId) {
      query.roomId = sanitizeString(roomId);
    }

    const messagesToDelete = await db.collection('messages')
      .find(query)
      .project({ _id: 1, roomId: 1 })
      .toArray();

    if (messagesToDelete.length === 0) {
      return sendError(res, 'No messages found or unauthorized', 'Not found', 404);
    }

    const deleteResult = await db.collection('messages').deleteMany({
      _id: { $in: messagesToDelete.map(m => m._id) },
      userId: req.userId
    });

    return sendSuccess(res, {
      deletedCount: deleteResult.deletedCount,
      requestedCount: validMessageIds.length,
      messageIds: messagesToDelete.map(m => m._id.toString())
    }, `Successfully deleted ${deleteResult.deletedCount} message(s)`);
  } catch (error) {
    console.error('Bulk delete messages error:', error);
    return sendError(res, error, 'Failed to delete messages', 500);
  }
});

router.post('/room/:roomId/bulk-delete', verifyToken, bulkDeleteLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { messageIds, beforeDate, afterDate } = req.body;

    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const group = await db.collection('groups').findOne({ _id: new ObjectId(roomId) });
    if (!group) {
      return sendError(res, 'Group not found', 'Not found', 404);
    }

    const isOwner = group.owner === req.userId;
    const isAdmin = group.admins.includes(req.userId);
    const isMember = group.members.some(m => m.userId === req.userId);

    if (!isMember) {
      return sendError(res, 'You are not a member of this group', 'Forbidden', 403);
    }

    let query = {
      roomId: roomId
    };

    if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
      if (messageIds.length > 100) {
        return sendError(res, 'Cannot delete more than 100 messages at once', 'Validation error', 400);
      }
      const validMessageIds = messageIds
        .filter(id => id && ObjectId.isValid(id))
        .map(id => new ObjectId(id));
      
      if (validMessageIds.length === 0) {
        return sendError(res, 'No valid message IDs provided', 'Validation error', 400);
      }
      query._id = { $in: validMessageIds };
    }

    if (beforeDate) {
      query.createdAt = { ...query.createdAt, $lt: new Date(beforeDate).toISOString() };
    }

    if (afterDate) {
      query.createdAt = { ...query.createdAt, $gte: new Date(afterDate).toISOString() };
    }

    if (!isOwner && !isAdmin) {
      query.userId = req.userId;
    }

    const deleteResult = await db.collection('messages').deleteMany(query);

    return sendSuccess(res, {
      deletedCount: deleteResult.deletedCount,
      roomId: roomId
    }, `Successfully deleted ${deleteResult.deletedCount} message(s) from room`);
  } catch (error) {
    console.error('Bulk delete room messages error:', error);
    return sendError(res, error, 'Failed to delete messages', 500);
  }
});

export default router;

