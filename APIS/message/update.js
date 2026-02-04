import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { validateText, sanitizeString, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const messageUpdateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many update requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});
router.delete('/:messageId', verifyToken, messageUpdateLimiter, async (req, res) => {
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
      _id: new ObjectId(messageId),
      userId: req.userId
    });

    if (!message) {
      return sendError(res, 'Message not found or unauthorized', 'Not found', 404);
    }

    const deleteResult = await db.collection('messages').deleteOne({ 
      _id: new ObjectId(messageId),
      userId: req.userId
    });

    if (deleteResult.deletedCount === 0) {
      return sendError(res, 'Message not found or unauthorized', 'Not found', 404);
    }

    return sendSuccess(res, null, 'Message deleted successfully');
  } catch (error) {
    console.error('Delete message error:', error);
    return sendError(res, error, 'Failed to delete message', 500);
  }
});

router.put('/:messageId', verifyToken, messageUpdateLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const allowedFields = ['text'];
    const body = whitelistObject(req.body, allowedFields);
    let { text } = body;

    if (!ObjectId.isValid(messageId)) {
      return sendError(res, 'Invalid message ID', 'Validation error', 400);
    }

    if (!text) {
      return sendError(res, 'Text is required', 'Validation error', 400);
    }

    try {
      text = validateText(text, 10000);
    } catch (error) {
      return sendError(res, error.message, 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const message = await db.collection('messages').findOne({
      _id: new ObjectId(messageId),
      userId: req.userId
    });

    if (!message) {
      return sendError(res, 'Message not found or unauthorized', 'Not found', 404);
    }

    const oldText = message.text;
    const editHistory = message.editHistory || [];

    editHistory.push({
      text: oldText,
      editedAt: message.updatedAt || message.createdAt,
      editedBy: req.userId
    });

    const updateResult = await db.collection('messages').updateOne(
      { 
        _id: new ObjectId(messageId),
        userId: req.userId
      },
      {
        $set: {
          text,
          updatedAt: new Date().toISOString(),
          editHistory: editHistory,
          isEdited: true
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      return sendError(res, 'Message not found or unauthorized', 'Not found', 404);
    }

    const updatedMessage = await db.collection('messages').findOne({
      _id: new ObjectId(messageId)
    });

    return sendSuccess(res, updatedMessage, 'Message updated successfully');
  } catch (error) {
    console.error('Update message error:', error);
    return sendError(res, error, 'Failed to update message', 500);
  }
});

export default router;

