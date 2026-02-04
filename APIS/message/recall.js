import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const recallLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

async function canRecall(db, message, userId) {
  // Sender can always recall own message
  if (message.userId === userId) return { ok: true };

  // If it's a group room, owner/admin can recall any message
  if (message.roomId && isValidObjectId(message.roomId)) {
    const group = await db.collection('groups').findOne({ _id: new ObjectId(message.roomId) });
    if (group) {
      const isOwner = group.owner === userId;
      const isAdmin = group.admins?.includes(userId);
      if (isOwner || isAdmin) return { ok: true };
      return { ok: false, status: 403, error: 'Only sender or group admin/owner can recall this message' };
    }
  }

  return { ok: false, status: 403, error: 'Only sender can recall this message' };
}

router.post('/:messageId/recall', verifyToken, recallLimiter, async (req, res) => {
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

    if (message.isRecalled) {
      return sendError(res, 'Message is already recalled', 'Validation error', 400);
    }

    const perm = await canRecall(db, message, req.userId);
    if (!perm.ok) {
      return sendError(res, perm.error, 'Forbidden', perm.status || 403);
    }

    const now = new Date().toISOString();
    const snapshot = {
      text: message.text || '',
      fileUrl: message.fileUrl || null,
      fileType: message.fileType || null,
      messageType: message.messageType || 'text',
      duration: typeof message.duration === 'number' ? message.duration : null,
      createdAt: message.createdAt || null,
    };

    await db.collection('messages').updateOne(
      { _id: new ObjectId(messageId) },
      {
        $set: {
          isRecalled: true,
          recalledAt: now,
          recalledBy: req.userId,
          recallSnapshot: snapshot,
          // Clear visible content
          text: '',
          fileUrl: null,
          fileType: null,
          duration: null,
          messageType: 'recalled',
          updatedAt: now,
        },
      }
    );

    const updated = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });
    return sendSuccess(res, updated, 'Message recalled successfully');
  } catch (error) {
    console.error('Recall message error:', error);
    return sendError(res, error, 'Failed to recall message', 500);
  }
});

export default router;


