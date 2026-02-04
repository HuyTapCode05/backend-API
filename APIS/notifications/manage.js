import express from 'express';
import { ObjectId } from 'mongodb';
import rateLimit from 'express-rate-limit';
import { getDB } from '../../config/database.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import { sendError, sendSuccess } from '../utils/response.js';

const router = express.Router();

const notificationsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/notifications/unread-count
router.get('/unread-count', verifyToken, notificationsLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const unreadCount = await db.collection('notifications').countDocuments({
      userId: req.userId,
      read: false,
    });

    return sendSuccess(res, { unreadCount }, 'Unread notifications count retrieved');
  } catch (error) {
    console.error('Get unread notifications count error:', error);
    return sendError(res, error, 'Failed to get unread count', 500);
  }
});

// DELETE /api/notifications/:notificationId
router.delete('/:notificationId', verifyToken, notificationsLimiter, async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId || !isValidObjectId(notificationId)) {
      return sendError(res, 'Valid notification ID is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const result = await db.collection('notifications').deleteOne({
      _id: new ObjectId(notificationId),
      userId: req.userId,
    });

    if (result.deletedCount === 0) {
      return sendError(res, 'Notification not found', 'Not found', 404);
    }

    return sendSuccess(res, { notificationId }, 'Notification deleted');
  } catch (error) {
    console.error('Delete notification error:', error);
    return sendError(res, error, 'Failed to delete notification', 500);
  }
});

// DELETE /api/notifications/clear?mode=all|read|unread
router.delete('/clear', verifyToken, notificationsLimiter, async (req, res) => {
  try {
    const { mode = 'all' } = req.query;

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const query = { userId: req.userId };
    if (mode === 'read') query.read = true;
    else if (mode === 'unread') query.read = false;
    else if (mode !== 'all') {
      return sendError(res, 'mode must be one of: all|read|unread', 'Validation error', 400);
    }

    const result = await db.collection('notifications').deleteMany(query);

    return sendSuccess(
      res,
      { deletedCount: result.deletedCount, mode },
      'Notifications cleared'
    );
  } catch (error) {
    console.error('Clear notifications error:', error);
    return sendError(res, error, 'Failed to clear notifications', 500);
  }
});

export default router;


