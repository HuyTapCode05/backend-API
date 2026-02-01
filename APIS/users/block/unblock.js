import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { verifyToken } from '../../Auth/middleware.js';
import { isValidObjectId } from '../../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const blockLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/unblock', verifyToken, blockLimiter, async (req, res) => {
  try {
    const { userId: blockedUserId } = req.body;

    if (!blockedUserId || !isValidObjectId(blockedUserId)) {
      return sendError(res, 'Valid user ID is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const block = await db.collection('blocked_users').findOne({
      userId: req.userId,
      blockedUserId: blockedUserId
    });

    if (!block) {
      return sendError(res, 'User is not blocked', 'Validation error', 400);
    }

    await db.collection('blocked_users').deleteOne({
      userId: req.userId,
      blockedUserId: blockedUserId
    });

    return sendSuccess(res, {
      blockedUserId: blockedUserId
    }, 'User unblocked successfully');
  } catch (error) {
    console.error('Unblock user error:', error);
    return sendError(res, error, 'Failed to unblock user', 500);
  }
});

export default router;

