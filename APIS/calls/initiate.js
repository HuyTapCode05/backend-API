import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const callLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many call requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/initiate', verifyToken, callLimiter, async (req, res) => {
  try {
    const { recipientId, callType, roomId } = req.body;

    if (!recipientId || !isValidObjectId(recipientId)) {
      return sendError(res, 'Valid recipient ID is required', 'Validation error', 400);
    }

    if (recipientId === req.userId) {
      return sendError(res, 'Cannot call yourself', 'Validation error', 400);
    }

    const validCallTypes = ['voice', 'video'];
    const type = callType && validCallTypes.includes(callType.toLowerCase()) 
      ? callType.toLowerCase() 
      : 'voice';

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const caller = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    if (!caller) {
      return sendError(res, 'Caller not found', 'Not found', 404);
    }

    const recipient = await db.collection('users').findOne(
      { _id: new ObjectId(recipientId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    if (!recipient) {
      return sendError(res, 'Recipient not found', 'Not found', 404);
    }

    const callId = new ObjectId();
    const call = {
      _id: callId,
      callerId: req.userId,
      callerUsername: caller.username,
      callerAvatar: caller.avatar || null,
      recipientId: recipientId,
      recipientUsername: recipient.username,
      recipientAvatar: recipient.avatar || null,
      callType: type,
      roomId: roomId || null,
      status: 'ringing',
      startedAt: new Date().toISOString(),
      endedAt: null,
      duration: 0,
      createdAt: new Date().toISOString()
    };

    await db.collection('calls').insertOne(call);

    return sendSuccess(res, {
      callId: callId.toString(),
      caller: {
        userId: req.userId,
        username: caller.username,
        avatar: caller.avatar
      },
      recipient: {
        userId: recipientId,
        username: recipient.username,
        avatar: recipient.avatar
      },
      callType: type,
      status: 'ringing',
      startedAt: call.startedAt
    }, 'Call initiated successfully');
  } catch (error) {
    console.error('Initiate call error:', error);
    return sendError(res, error, 'Failed to initiate call', 500);
  }
});

export default router;

