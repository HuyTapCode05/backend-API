import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { verifyToken } from '../../Auth/middleware.js';
import { isValidObjectId } from '../../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const presenceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:userId/status', verifyToken, presenceLimiter, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return sendError(res, 'Invalid user ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const presence = await db.collection('user_presence').findOne({ userId: userId });

    if (!presence) {
      return sendSuccess(res, {
        userId: userId,
        status: 'offline',
        lastSeen: null
      }, 'User status retrieved (offline by default)');
    }

    const isOnline = presence.status === 'online';
    const lastSeenTime = new Date(presence.lastSeen);
    const now = new Date();
    const timeDiff = now - lastSeenTime;

    if (isOnline && timeDiff > 5 * 60 * 1000) {
      await db.collection('user_presence').updateOne(
        { userId: userId },
        { $set: { status: 'offline', updatedAt: new Date().toISOString() } }
      );
      presence.status = 'offline';
    }

    return sendSuccess(res, {
      userId: userId,
      status: presence.status,
      lastSeen: presence.lastSeen,
      isOnline: presence.status === 'online'
    }, 'User status retrieved successfully');
  } catch (error) {
    console.error('Get user status error:', error);
    return sendError(res, error, 'Failed to get user status', 500);
  }
});

router.get('/friends/status', verifyToken, presenceLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const friends = await db.collection('friends')
      .find({ userId: req.userId })
      .toArray();

    const friendIds = friends.map(f => f.friendId);

    if (friendIds.length === 0) {
      return sendSuccess(res, {
        friends: [],
        onlineCount: 0,
        totalCount: 0
      }, 'Friends status retrieved successfully');
    }

    const presences = await db.collection('user_presence')
      .find({ userId: { $in: friendIds } })
      .toArray();

    const presenceMap = {};
    presences.forEach(p => {
      presenceMap[p.userId] = {
        status: p.status,
        lastSeen: p.lastSeen
      };
    });

    const now = new Date();
    const friendsStatus = friendIds.map(friendId => {
      const presence = presenceMap[friendId];
      let status = 'offline';
      let lastSeen = null;

      if (presence) {
        const lastSeenTime = new Date(presence.lastSeen);
        const timeDiff = now - lastSeenTime;

        if (presence.status === 'online' && timeDiff <= 5 * 60 * 1000) {
          status = 'online';
        } else {
          status = 'offline';
        }
        lastSeen = presence.lastSeen;
      }

      return {
        userId: friendId,
        status: status,
        lastSeen: lastSeen,
        isOnline: status === 'online'
      };
    });

    const onlineCount = friendsStatus.filter(f => f.isOnline).length;

    return sendSuccess(res, {
      friends: friendsStatus,
      onlineCount: onlineCount,
      totalCount: friendsStatus.length
    }, 'Friends status retrieved successfully');
  } catch (error) {
    console.error('Get friends status error:', error);
    return sendError(res, error, 'Failed to get friends status', 500);
  }
});

export default router;

