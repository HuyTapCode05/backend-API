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

router.post('/accept', verifyToken, friendRequestLimiter, async (req, res) => {
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
      { $set: { status: 'accepted', updatedAt: new Date().toISOString() } }
    );

    const fromUser = await db.collection('users').findOne(
      { _id: new ObjectId(request.fromUserId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    const toUser = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    await db.collection('friends').insertMany([
      {
        _id: new ObjectId(),
        userId: request.fromUserId,
        friendId: req.userId,
        friendInfo: {
          userId: req.userId,
          username: toUser.username,
          avatar: toUser.avatar
        },
        createdAt: new Date().toISOString()
      },
      {
        _id: new ObjectId(),
        userId: req.userId,
        friendId: request.fromUserId,
        friendInfo: {
          userId: request.fromUserId,
          username: fromUser.username,
          avatar: fromUser.avatar
        },
        createdAt: new Date().toISOString()
      }
    ]);

    await db.collection('notifications').insertOne({
      _id: new ObjectId(),
      userId: request.fromUserId,
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      message: `${toUser.username} accepted your friend request`,
      data: {
        userId: req.userId,
        username: toUser.username,
        avatar: toUser.avatar
      },
      read: false,
      createdAt: new Date().toISOString()
    });

    return sendSuccess(res, {
      friendId: request.fromUserId,
      friendInfo: {
        userId: request.fromUserId,
        username: fromUser.username,
        avatar: fromUser.avatar
      }
    }, 'Friend request accepted successfully');
  } catch (error) {
    console.error('Accept friend request error:', error);
    return sendError(res, error, 'Failed to accept friend request', 500);
  }
});

export default router;

