import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const pinLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/:messageId/pin', verifyToken, pinLimiter, async (req, res) => {
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

    if (message.isPinned) {
      return sendError(res, 'Message is already pinned', 'Validation error', 400);
    }

    const roomId = message.roomId;
    const isGroup = roomId.length === 24 && isValidObjectId(roomId);

    if (isGroup) {
      const group = await db.collection('groups').findOne({ _id: new ObjectId(roomId) });
      if (!group) {
        return sendError(res, 'Group not found', 'Not found', 404);
      }

      const isMember = group.members.some(m => m.userId === req.userId);
      const isAdmin = group.admins.includes(req.userId);
      const isOwner = group.owner === req.userId;

      if (!isMember) {
        return sendError(res, 'You are not a member of this group', 'Forbidden', 403);
      }

      if (!isOwner && !isAdmin) {
        return sendError(res, 'Only group owner or admin can pin messages', 'Forbidden', 403);
      }
    }

    const pinnedCount = await db.collection('messages').countDocuments({
      roomId: roomId,
      isPinned: true
    });

    if (pinnedCount >= 10) {
      return sendError(res, 'Maximum 10 pinned messages allowed per room', 'Validation error', 400);
    }

    await db.collection('messages').updateOne(
      { _id: new ObjectId(messageId) },
      {
        $set: {
          isPinned: true,
          pinnedAt: new Date().toISOString(),
          pinnedBy: req.userId,
          updatedAt: new Date().toISOString()
        }
      }
    );

    const updatedMessage = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    return sendSuccess(res, {
      messageId: messageId,
      isPinned: true,
      pinnedAt: updatedMessage.pinnedAt,
      pinnedBy: updatedMessage.pinnedBy
    }, 'Message pinned successfully');
  } catch (error) {
    console.error('Pin message error:', error);
    return sendError(res, error, 'Failed to pin message', 500);
  }
});

router.delete('/:messageId/pin', verifyToken, pinLimiter, async (req, res) => {
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

    if (!message.isPinned) {
      return sendError(res, 'Message is not pinned', 'Validation error', 400);
    }

    const roomId = message.roomId;
    const isGroup = roomId.length === 24 && isValidObjectId(roomId);

    if (isGroup) {
      const group = await db.collection('groups').findOne({ _id: new ObjectId(roomId) });
      if (group) {
        const isAdmin = group.admins.includes(req.userId);
        const isOwner = group.owner === req.userId;
        const isPinnedBy = message.pinnedBy === req.userId;

        if (!isOwner && !isAdmin && !isPinnedBy) {
          return sendError(res, 'Only group owner, admin, or the user who pinned can unpin messages', 'Forbidden', 403);
        }
      }
    } else {
      if (message.pinnedBy !== req.userId && message.userId !== req.userId) {
        return sendError(res, 'Only the user who pinned or the message sender can unpin', 'Forbidden', 403);
      }
    }

    await db.collection('messages').updateOne(
      { _id: new ObjectId(messageId) },
      {
        $unset: {
          isPinned: '',
          pinnedAt: '',
          pinnedBy: ''
        },
        $set: {
          updatedAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, {
      messageId: messageId,
      isPinned: false
    }, 'Message unpinned successfully');
  } catch (error) {
    console.error('Unpin message error:', error);
    return sendError(res, error, 'Failed to unpin message', 500);
  }
});

router.get('/room/:roomId/pinned', verifyToken, pinLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const isGroup = roomId.length === 24 && isValidObjectId(roomId);

    if (isGroup) {
      const group = await db.collection('groups').findOne({ _id: new ObjectId(roomId) });
      if (group) {
        const isMember = group.members.some(m => m.userId === req.userId);
        if (group.isPrivate && !isMember) {
          return sendError(res, 'Access denied. This is a private group.', 'Forbidden', 403);
        }
      }
    }

    const pinnedMessages = await db.collection('messages')
      .find({
        roomId: roomId,
        isPinned: true
      })
      .sort({ pinnedAt: -1 })
      .toArray();

    const userIds = [...new Set(pinnedMessages.map(m => m.userId))];
    const users = await db.collection('users')
      .find({ _id: { $in: userIds.map(id => new ObjectId(id)) } })
      .project({ password: 0 })
      .toArray();

    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar || null
      };
    });

    const enrichedMessages = pinnedMessages.map(msg => ({
      ...msg,
      _id: msg._id.toString(),
      user: userMap[msg.userId] || {
        userId: msg.userId,
        username: msg.username,
        avatar: msg.userAvatar
      }
    }));

    return sendSuccess(res, {
      messages: enrichedMessages,
      total: enrichedMessages.length
    }, 'Pinned messages retrieved successfully');
  } catch (error) {
    console.error('Get pinned messages error:', error);
    return sendError(res, error, 'Failed to get pinned messages', 500);
  }
});

export default router;

