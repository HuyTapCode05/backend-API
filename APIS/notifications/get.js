import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const notificationsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', verifyToken, notificationsLimiter, async (req, res) => {
  try {
    const { limit = 50, skip = 0, unreadOnly = false, type } = req.query;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    let query = { userId: req.userId };

    if (unreadOnly === 'true' || unreadOnly === true) {
      query.read = false;
    }

    if (type) {
      query.type = type;
    }

    const notifications = await db.collection('notifications')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const totalCount = await db.collection('notifications').countDocuments(query);
    const unreadCount = await db.collection('notifications').countDocuments({
      userId: req.userId,
      read: false
    });

    return sendSuccess(res, {
      notifications: notifications.map(n => ({
        _id: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        read: n.read,
        createdAt: n.createdAt
      })),
      total: totalCount,
      unreadCount: unreadCount,
      returned: notifications.length,
      hasMore: (skipNum + limitNum) < totalCount
    }, 'Notifications retrieved successfully');
  } catch (error) {
    console.error('Get notifications error:', error);
    return sendError(res, error, 'Failed to get notifications', 500);
  }
});

export default router;
