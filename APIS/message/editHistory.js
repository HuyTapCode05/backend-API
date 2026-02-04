import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const editHistoryLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:messageId/edit-history', verifyToken, editHistoryLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!ObjectId.isValid(messageId)) {
      return sendError(res, 'Invalid message ID', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const message = await db.collection('messages').findOne({
      _id: new ObjectId(messageId)
    }, {
      projection: {
        _id: 1,
        userId: 1,
        roomId: 1,
        text: 1,
        editHistory: 1,
        isEdited: 1,
        createdAt: 1,
        updatedAt: 1
      }
    });

    if (!message) {
      return sendError(res, 'Message not found', 'Not found', 404);
    }

    const isOwner = message.userId === req.userId;
    
    const group = await db.collection('groups').findOne({ _id: new ObjectId(message.roomId) });
    const isGroupMember = group && group.members.some(m => m.userId === req.userId);

    if (!isOwner && !isGroupMember) {
      return sendError(res, 'Access denied', 'Forbidden', 403);
    }

    const editHistory = message.editHistory || [];
    const currentVersion = {
      text: message.text,
      editedAt: message.updatedAt || message.createdAt,
      isCurrent: true
    };

    const allVersions = [
      currentVersion,
      ...editHistory.reverse().map((edit, index) => ({
        ...edit,
        isCurrent: false,
        version: editHistory.length - index
      }))
    ];

    return sendSuccess(res, {
      messageId: messageId,
      isEdited: message.isEdited || false,
      totalEdits: editHistory.length,
      versions: allVersions,
      originalText: editHistory.length > 0 ? editHistory[editHistory.length - 1].text : message.text,
      currentText: message.text
    }, 'Edit history retrieved successfully');
  } catch (error) {
    console.error('Get edit history error:', error);
    return sendError(res, error, 'Failed to get edit history', 500);
  }
});

export default router;

