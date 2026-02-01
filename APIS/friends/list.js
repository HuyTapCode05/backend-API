import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const friendsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', verifyToken, friendsLimiter, async (req, res) => {
  try {
    const { limit = 100, skip = 0, search } = req.query;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const limitNum = Math.min(parseInt(limit) || 100, 200);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    let query = { userId: req.userId };

    if (search && search.trim().length > 0) {
      query['friendInfo.username'] = { $regex: search.trim(), $options: 'i' };
    }

    const friends = await db.collection('friends')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const totalCount = await db.collection('friends').countDocuments(query);

    return sendSuccess(res, {
      friends: friends.map(f => ({
        friendId: f.friendId,
        friendInfo: f.friendInfo,
        createdAt: f.createdAt
      })),
      total: totalCount,
      returned: friends.length,
      hasMore: (skipNum + limitNum) < totalCount
    }, 'Friends retrieved successfully');
  } catch (error) {
    console.error('Get friends error:', error);
    return sendError(res, error, 'Failed to get friends', 500);
  }
});

router.delete('/:friendId', verifyToken, friendsLimiter, async (req, res) => {
  try {
    const { friendId } = req.params;

    if (!friendId || !isValidObjectId(friendId)) {
      return sendError(res, 'Valid friend ID is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    await db.collection('friends').deleteMany({
      $or: [
        { userId: req.userId, friendId: friendId },
        { userId: friendId, friendId: req.userId }
      ]
    });

    await db.collection('friend_requests').updateMany(
      {
        $or: [
          { fromUserId: req.userId, toUserId: friendId },
          { fromUserId: friendId, toUserId: req.userId }
        ]
      },
      { $set: { status: 'removed', updatedAt: new Date().toISOString() } }
    );

    return sendSuccess(res, { friendId }, 'Friend removed successfully');
  } catch (error) {
    console.error('Remove friend error:', error);
    return sendError(res, error, 'Failed to remove friend', 500);
  }
});

export default router;

