import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId, isValidRoomId, sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const forwardLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many forward requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/:messageId/forward', verifyToken, forwardLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { targetRoomIds, text } = req.body;

    if (!ObjectId.isValid(messageId)) {
      return sendError(res, 'Invalid message ID', 'Validation error', 400);
    }

    if (!targetRoomIds || !Array.isArray(targetRoomIds) || targetRoomIds.length === 0) {
      return sendError(res, 'targetRoomIds array is required', 'Validation error', 400);
    }

    if (targetRoomIds.length > 10) {
      return sendError(res, 'Cannot forward to more than 10 rooms at once', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const originalMessage = await db.collection('messages').findOne({
      _id: new ObjectId(messageId)
    });

    if (!originalMessage) {
      return sendError(res, 'Message not found', 'Not found', 404);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const validSources = ['app', 'web', 'api'];
    const messageSource = req.body.source && validSources.includes(req.body.source.toLowerCase()) 
      ? req.body.source.toLowerCase() 
      : 'web';

    const forwardedMessages = [];
    const errors = [];

    for (const targetRoomId of targetRoomIds) {
      const roomId = sanitizeString(targetRoomId);
      
      if (!isValidRoomId(roomId)) {
        errors.push({ roomId, error: 'Invalid room ID format' });
        continue;
      }

      const group = await db.collection('groups').findOne({ _id: new ObjectId(roomId) });
      if (!group) {
        errors.push({ roomId, error: 'Group not found' });
        continue;
      }

      const isMember = group.members.some(m => m.userId === req.userId);
      if (!isMember) {
        errors.push({ roomId, error: 'You are not a member of this group' });
        continue;
      }

      const forwardedMessage = {
        _id: new ObjectId(),
        userId: req.userId,
        username: user.username,
        userAvatar: user.avatar || null,
        roomId: roomId,
        text: text || originalMessage.text || '',
        fileUrl: originalMessage.fileUrl || null,
        fileType: originalMessage.fileType || null,
        messageType: originalMessage.messageType || 'text',
        source: messageSource,
        forwardedFrom: {
          messageId: messageId,
          roomId: originalMessage.roomId,
          userId: originalMessage.userId,
          username: originalMessage.username,
          text: originalMessage.text,
          messageType: originalMessage.messageType
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await db.collection('messages').insertOne(forwardedMessage);
      forwardedMessages.push({
        messageId: forwardedMessage._id.toString(),
        roomId: roomId,
        roomName: group.name
      });
    }

    return sendSuccess(res, {
      forwardedCount: forwardedMessages.length,
      forwardedTo: forwardedMessages,
      errors: errors.length > 0 ? errors : undefined
    }, `Successfully forwarded message to ${forwardedMessages.length} room(s)`);
  } catch (error) {
    console.error('Forward message error:', error);
    return sendError(res, error, 'Failed to forward message', 500);
  }
});

export default router;

