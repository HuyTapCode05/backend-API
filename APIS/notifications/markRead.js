import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const notificationsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.put('/:notificationId/read', verifyToken, notificationsLimiter, async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId || !isValidObjectId(notificationId)) {
      return sendError(res, 'Valid notification ID is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const result = await db.collection('notifications').updateOne(
      { _id: new ObjectId(notificationId), userId: req.userId },
      { $set: { read: true, readAt: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return sendError(res, 'Notification not found', 'Not found', 404);
    }

    return sendSuccess(res, { notificationId }, 'Notification marked as read');
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return sendError(res, error, 'Failed to mark notification as read', 500);
  }
});

router.put('/read-all', verifyToken, notificationsLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const result = await db.collection('notifications').updateMany(
      { userId: req.userId, read: false },
      { $set: { read: true, readAt: new Date().toISOString() } }
    );

    return sendSuccess(res, {
      updatedCount: result.modifiedCount
    }, 'All notifications marked as read');
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    return sendError(res, error, 'Failed to mark all notifications as read', 500);
  }
});

export default router;

