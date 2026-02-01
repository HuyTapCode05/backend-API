import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { verifyToken } from '../../Auth/middleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const presenceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.put('/status', verifyToken, presenceLimiter, async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['online', 'offline', 'away', 'busy'];
    if (!status || !validStatuses.includes(status)) {
      return sendError(res, 'Valid status is required (online, offline, away, busy)', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const now = new Date().toISOString();

    await db.collection('user_presence').updateOne(
      { userId: req.userId },
      {
        $set: {
          status: status,
          lastSeen: now,
          updatedAt: now
        },
        $setOnInsert: {
          userId: req.userId,
          createdAt: now
        }
      },
      { upsert: true }
    );

    return sendSuccess(res, {
      userId: req.userId,
      status: status,
      lastSeen: now
    }, 'Status updated successfully');
  } catch (error) {
    console.error('Update presence status error:', error);
    return sendError(res, error, 'Failed to update status', 500);
  }
});

export default router;

