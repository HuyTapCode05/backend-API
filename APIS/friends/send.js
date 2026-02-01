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

router.post('/request', verifyToken, friendRequestLimiter, async (req, res) => {
  try {
    const { userId: targetUserId } = req.body;

    if (!targetUserId || !isValidObjectId(targetUserId)) {
      return sendError(res, 'Valid user ID is required', 'Validation error', 400);
    }

    if (targetUserId === req.userId) {
      return sendError(res, 'Cannot send friend request to yourself', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const targetUser = await db.collection('users').findOne(
      { _id: new ObjectId(targetUserId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    if (!targetUser) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const existingRequest = await db.collection('friend_requests').findOne({
      $or: [
        { fromUserId: req.userId, toUserId: targetUserId },
        { fromUserId: targetUserId, toUserId: req.userId }
      ]
    });

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return sendError(res, 'Friend request already exists', 'Validation error', 400);
      }
      if (existingRequest.status === 'accepted') {
        return sendError(res, 'Already friends', 'Validation error', 400);
      }
    }

    const areFriends = await db.collection('friends').findOne({
      $or: [
        { userId: req.userId, friendId: targetUserId },
        { userId: targetUserId, friendId: req.userId }
      ]
    });

    if (areFriends) {
      return sendError(res, 'Already friends', 'Validation error', 400);
    }

    const request = {
      _id: new ObjectId(),
      fromUserId: req.userId,
      toUserId: targetUserId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await db.collection('friend_requests').insertOne(request);

    const fromUser = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    await db.collection('notifications').insertOne({
      _id: new ObjectId(),
      userId: targetUserId,
      type: 'friend_request',
      title: 'New Friend Request',
      message: `${fromUser.username} sent you a friend request`,
      data: {
        fromUserId: req.userId,
        fromUsername: fromUser.username,
        fromAvatar: fromUser.avatar,
        requestId: request._id.toString()
      },
      read: false,
      createdAt: new Date().toISOString()
    });

    return sendSuccess(res, {
      requestId: request._id.toString(),
      fromUserId: req.userId,
      toUserId: targetUserId,
      status: 'pending'
    }, 'Friend request sent successfully');
  } catch (error) {
    console.error('Send friend request error:', error);
    return sendError(res, error, 'Failed to send friend request', 500);
  }
});

export default router;

