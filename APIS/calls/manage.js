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
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/:callId/accept', verifyToken, callLimiter, async (req, res) => {
  try {
    const { callId } = req.params;

    if (!isValidObjectId(callId)) {
      return sendError(res, 'Invalid call ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const call = await db.collection('calls').findOne({ _id: new ObjectId(callId) });

    if (!call) {
      return sendError(res, 'Call not found', 'Not found', 404);
    }

    if (call.recipientId !== req.userId) {
      return sendError(res, 'You are not the recipient of this call', 'Forbidden', 403);
    }

    if (call.status !== 'ringing') {
      return sendError(res, `Call is already ${call.status}`, 'Validation error', 400);
    }

    await db.collection('calls').updateOne(
      { _id: new ObjectId(callId) },
      {
        $set: {
          status: 'accepted',
          acceptedAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, {
      callId: callId,
      status: 'accepted',
      acceptedAt: new Date().toISOString()
    }, 'Call accepted successfully');
  } catch (error) {
    console.error('Accept call error:', error);
    return sendError(res, error, 'Failed to accept call', 500);
  }
});

router.post('/:callId/reject', verifyToken, callLimiter, async (req, res) => {
  try {
    const { callId } = req.params;
    const { reason } = req.body;

    if (!isValidObjectId(callId)) {
      return sendError(res, 'Invalid call ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const call = await db.collection('calls').findOne({ _id: new ObjectId(callId) });

    if (!call) {
      return sendError(res, 'Call not found', 'Not found', 404);
    }

    if (call.recipientId !== req.userId && call.callerId !== req.userId) {
      return sendError(res, 'You are not part of this call', 'Forbidden', 403);
    }

    if (call.status === 'ended' || call.status === 'rejected') {
      return sendError(res, 'Call is already ended', 'Validation error', 400);
    }

    await db.collection('calls').updateOne(
      { _id: new ObjectId(callId) },
      {
        $set: {
          status: 'rejected',
          endedAt: new Date().toISOString(),
          rejectionReason: reason || null
        }
      }
    );

    return sendSuccess(res, {
      callId: callId,
      status: 'rejected',
      endedAt: new Date().toISOString()
    }, 'Call rejected successfully');
  } catch (error) {
    console.error('Reject call error:', error);
    return sendError(res, error, 'Failed to reject call', 500);
  }
});

router.post('/:callId/end', verifyToken, callLimiter, async (req, res) => {
  try {
    const { callId } = req.params;
    const { duration } = req.body;

    if (!isValidObjectId(callId)) {
      return sendError(res, 'Invalid call ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const call = await db.collection('calls').findOne({ _id: new ObjectId(callId) });

    if (!call) {
      return sendError(res, 'Call not found', 'Not found', 404);
    }

    if (call.callerId !== req.userId && call.recipientId !== req.userId) {
      return sendError(res, 'You are not part of this call', 'Forbidden', 403);
    }

    if (call.status === 'ended' || call.status === 'rejected') {
      return sendError(res, 'Call is already ended', 'Validation error', 400);
    }

    const endedAt = new Date().toISOString();
    const startTime = new Date(call.startedAt);
    const endTime = new Date(endedAt);
    const callDuration = duration || Math.floor((endTime - startTime) / 1000);

    await db.collection('calls').updateOne(
      { _id: new ObjectId(callId) },
      {
        $set: {
          status: 'ended',
          endedAt: endedAt,
          duration: callDuration
        }
      }
    );

    return sendSuccess(res, {
      callId: callId,
      status: 'ended',
      endedAt: endedAt,
      duration: callDuration
    }, 'Call ended successfully');
  } catch (error) {
    console.error('End call error:', error);
    return sendError(res, error, 'Failed to end call', 500);
  }
});

router.get('/:callId', verifyToken, callLimiter, async (req, res) => {
  try {
    const { callId } = req.params;

    if (!isValidObjectId(callId)) {
      return sendError(res, 'Invalid call ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const call = await db.collection('calls').findOne({ _id: new ObjectId(callId) });

    if (!call) {
      return sendError(res, 'Call not found', 'Not found', 404);
    }

    if (call.callerId !== req.userId && call.recipientId !== req.userId) {
      return sendError(res, 'You are not part of this call', 'Forbidden', 403);
    }

    return sendSuccess(res, call, 'Call retrieved successfully');
  } catch (error) {
    console.error('Get call error:', error);
    return sendError(res, error, 'Failed to get call', 500);
  }
});

router.get('/history', verifyToken, callLimiter, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const calls = await db.collection('calls')
      .find({
        $or: [
          { callerId: req.userId },
          { recipientId: req.userId }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .toArray();

    return sendSuccess(res, {
      calls: calls,
      total: calls.length
    }, 'Call history retrieved successfully');
  } catch (error) {
    console.error('Get call history error:', error);
    return sendError(res, error, 'Failed to get call history', 500);
  }
});

export default router;

