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
  max: 100,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/:messageId/read', verifyToken, readReceiptsLimiter, async (req, res) => {
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

    const existingReceipt = await db.collection('read_receipts').findOne({
      messageId: messageId,
      userId: req.userId
    });

    if (existingReceipt) {
      await db.collection('read_receipts').updateOne(
        { messageId: messageId, userId: req.userId },
        { $set: { readAt: new Date().toISOString() } }
      );
    } else {
      await db.collection('read_receipts').insertOne({
        _id: new ObjectId(),
        messageId: messageId,
        userId: req.userId,
        roomId: message.roomId,
        readAt: new Date().toISOString()
      });
    }

    return sendSuccess(res, {
      messageId: messageId,
      readAt: new Date().toISOString()
    }, 'Message marked as read');
  } catch (error) {
    console.error('Mark message as read error:', error);
    return sendError(res, error, 'Failed to mark message as read', 500);
  }
});

router.post('/room/:roomId/read-all', verifyToken, readReceiptsLimiter, async (req, res) => {
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

    const existingReceipts = await db.collection('read_receipts')
      .find({
        messageId: { $in: messageIds },
        userId: req.userId
      })
      .toArray();

    const existingMessageIds = new Set(existingReceipts.map(r => r.messageId));

    const newReceipts = messageIds
      .filter(id => !existingMessageIds.has(id))
      .map(messageId => ({
        _id: new ObjectId(),
        messageId: messageId,
        userId: req.userId,
        roomId: roomId,
        readAt: new Date().toISOString()
      }));

    if (newReceipts.length > 0) {
      await db.collection('read_receipts').insertMany(newReceipts);
    }

    await db.collection('read_receipts').updateMany(
      {
        messageId: { $in: messageIds },
        userId: req.userId
      },
      { $set: { readAt: new Date().toISOString() } }
    );

    return sendSuccess(res, {
      roomId: roomId,
      markedCount: messageIds.length
    }, 'All messages in room marked as read');
  } catch (error) {
    console.error('Mark all messages as read error:', error);
    return sendError(res, error, 'Failed to mark all messages as read', 500);
  }
});

export default router;

