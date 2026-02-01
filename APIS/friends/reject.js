import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const friendRequestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many friend requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/reject', verifyToken, friendRequestLimiter, async (req, res) => {
  try {
    const { requestId } = req.body;

    if (!requestId || !isValidObjectId(requestId)) {
      return sendError(res, 'Valid request ID is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const request = await db.collection('friend_requests').findOne({
      _id: new ObjectId(requestId),
      toUserId: req.userId,
      status: 'pending'
    });

    if (!request) {
      return sendError(res, 'Friend request not found or already processed', 'Not found', 404);
    }

    await db.collection('friend_requests').updateOne(
      { _id: new ObjectId(requestId) },
      { $set: { status: 'rejected', updatedAt: new Date().toISOString() } }
    );

    return sendSuccess(res, { requestId }, 'Friend request rejected successfully');
  } catch (error) {
    console.error('Reject friend request error:', error);
    return sendError(res, error, 'Failed to reject friend request', 500);
  }
});

export default router;

