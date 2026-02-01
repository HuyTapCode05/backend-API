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
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/blocked', verifyToken, blockLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const blockedUsers = await db.collection('blocked_users')
      .find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .toArray();

    return sendSuccess(res, {
      blockedUsers: blockedUsers.map(b => ({
        blockedUserId: b.blockedUserId,
        blockedUserInfo: b.blockedUserInfo,
        createdAt: b.createdAt
      })),
      total: blockedUsers.length
    }, 'Blocked users retrieved successfully');
  } catch (error) {
    console.error('Get blocked users error:', error);
    return sendError(res, error, 'Failed to get blocked users', 500);
  }
});

router.get('/check/:userId', verifyToken, blockLimiter, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 'Invalid user ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const isBlocked = await db.collection('blocked_users').findOne({
      $or: [
        { userId: req.userId, blockedUserId: userId },
        { userId: userId, blockedUserId: req.userId }
      ]
    });

    return sendSuccess(res, {
      userId: userId,
      isBlocked: !!isBlocked,
      blockedByMe: isBlocked && isBlocked.userId === req.userId,
      blockedByThem: isBlocked && isBlocked.userId === userId
    }, 'Block status retrieved successfully');
  } catch (error) {
    console.error('Check block status error:', error);
    return sendError(res, error, 'Failed to check block status', 500);
  }
});

export default router;

