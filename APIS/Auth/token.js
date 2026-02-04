import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from './middleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(res, 'Refresh token is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
      if (decoded.type !== 'refresh_token') {
        return sendError(res, 'Invalid token type', 'Validation error', 400);
      }
    } catch (error) {
      return sendError(res, 'Invalid or expired refresh token', 'Authentication error', 401);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      await db.collection('refresh_tokens').deleteMany({ userId: new ObjectId(decoded.userId) });
      return sendError(res, 'User not found', 'Not found', 404);
    }

    if (user.locked || user.disabled) {
      await db.collection('refresh_tokens').deleteMany({ userId: new ObjectId(decoded.userId) });
      return sendError(res, 'Account is locked or disabled', 'Authentication error', 403);
    }

    const tokenExists = await db.collection('refresh_tokens').findOne({ token: refreshToken });
    if (!tokenExists) {
      return sendError(res, 'Refresh token not found or already used', 'Authentication error', 401);
    }

    const accessToken = jwt.sign(
      { userId: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const newRefreshToken = jwt.sign(
      { userId: user._id.toString(), username: user.username, type: 'refresh_token' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await db.collection('refresh_tokens').updateOne(
      { token: refreshToken },
      {
        $set: {
          token: newRefreshToken,
          createdAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, {
      accessToken,
      refreshToken: newRefreshToken,
      user
    }, 'Token refreshed successfully');
  } catch (error) {
    console.error('Refresh token error:', error);
    return sendError(res, error, 'Failed to refresh token', 500);
  }
});

router.post('/logout', verifyToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const db = getDB();

    if (db && refreshToken) {
      await db.collection('refresh_tokens').deleteOne({ token: refreshToken });
    }

    return sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    console.error('Logout error:', error);
    return sendError(res, error, 'Failed to logout', 500);
  }
});

export default router;