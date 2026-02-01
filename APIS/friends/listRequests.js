import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const friendRequestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many friend requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/requests', verifyToken, friendRequestLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const requests = await db.collection('friend_requests')
      .find({ toUserId: req.userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    const fromUserIds = requests.map(r => r.fromUserId);
    const users = await db.collection('users')
      .find({ _id: { $in: fromUserIds.map(id => new ObjectId(id)) } })
      .project({ password: 0, username: 1, avatar: 1, email: 1 })
      .toArray();

    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar,
        email: user.email
      };
    });

    const enrichedRequests = requests.map(req => ({
      requestId: req._id.toString(),
      fromUser: userMap[req.fromUserId] || null,
      status: req.status,
      createdAt: req.createdAt
    }));

    return sendSuccess(res, {
      requests: enrichedRequests,
      total: enrichedRequests.length
    }, 'Friend requests retrieved successfully');
  } catch (error) {
    console.error('Get friend requests error:', error);
    return sendError(res, error, 'Failed to get friend requests', 500);
  }
});

export default router;

