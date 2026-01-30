import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { whitelistObject, isValidUsername, isValidEmail, sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const updateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 10, 
  message: 'Too many update requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/me', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    // Get additional stats
    const messageCount = await db.collection('messages').countDocuments({
      userId: req.userId
    });

    const userResponse = {
      _id: user._id.toString(),
      id: user._id.toString(),
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      avatar: user.avatar || null,
      emailVerified: user.emailVerified || false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt || user.createdAt,
      stats: {
        messageCount: messageCount
      }
    };

    return sendSuccess(res, userResponse, 'User retrieved successfully');
  } catch (error) {
    console.error('Get user error:', error);
    return sendError(res, error, 'Failed to get user', 500);
  }
});

router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return sendError(res, 'Invalid user ID', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0, email: 0 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const messageCount = await db.collection('messages').countDocuments({
      userId: userId
    });

    const userResponse = {
      _id: user._id.toString(),
      id: user._id.toString(),
      userId: user._id.toString(),
      username: user.username,
      avatar: user.avatar || null,
      emailVerified: user.emailVerified || false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt || user.createdAt,
      stats: {
        messageCount: messageCount
      }
    };

    return sendSuccess(res, userResponse, 'User retrieved successfully');
  } catch (error) {
    console.error('Get user by ID error:', error);
    return sendError(res, error, 'Failed to get user', 500);
  }
});

router.put('/me', verifyToken, updateLimiter, async (req, res) => {
  try {
    const allowedFields = ['username', 'email'];
    const updateData = whitelistObject(req.body, allowedFields);
    const { username, email } = updateData;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    // Get current user
    const currentUser = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) }
    );

    if (!currentUser) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const finalUpdateData = {
      updatedAt: new Date().toISOString()
    };

    if (username) {
      const sanitizedUsername = sanitizeString(username);
      if (!isValidUsername(sanitizedUsername)) {
        return sendError(res, 'Username must be 3-20 characters, alphanumeric and underscore only', 'Validation error', 400);
      }

      const existingUser = await db.collection('users').findOne({
        username: sanitizedUsername,
        _id: { $ne: new ObjectId(req.userId) }
      });

      if (existingUser) {
        return sendError(res, 'Username already exists', 'Conflict', 409);
      }

      finalUpdateData.username = sanitizedUsername;
    }

    if (email) {
      const sanitizedEmail = sanitizeString(email);
      if (!isValidEmail(sanitizedEmail)) {
        return sendError(res, 'Invalid email format', 'Validation error', 400);
      }

      const existingUser = await db.collection('users').findOne({
        email: sanitizedEmail,
        _id: { $ne: new ObjectId(req.userId) }
      });

      if (existingUser) {
        return sendError(res, 'Email already exists', 'Conflict', 409);
      }

      finalUpdateData.email = sanitizedEmail;
      finalUpdateData.emailVerified = false;
    }

    if (Object.keys(finalUpdateData).length > 1) {
      await db.collection('users').updateOne(
        { _id: new ObjectId(req.userId) },
        { $set: finalUpdateData }
      );
    }

    const updatedUser = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0 } }
    );

    const userResponse = {
      _id: updatedUser._id.toString(),
      id: updatedUser._id.toString(),
      userId: updatedUser._id.toString(),
      username: updatedUser.username,
      email: updatedUser.email,
      avatar: updatedUser.avatar || null,
      emailVerified: updatedUser.emailVerified || false,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt || updatedUser.createdAt
    };

    return sendSuccess(res, userResponse, 'Profile updated successfully');
  } catch (error) {
    console.error('Update user error:', error);
    return sendError(res, error, 'Failed to update profile', 500);
  }
});

export default router;

