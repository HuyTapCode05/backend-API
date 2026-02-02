import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from './middleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const tokenInfoLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Get current token info (decode token without secret)
router.get('/info', verifyToken, tokenInfoLimiter, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;

    if (!token) {
      return sendError(res, 'No token provided', 'Validation error', 400);
    }

    // Decode token without verification (just to show info)
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded) {
      return sendError(res, 'Invalid token format', 'Validation error', 400);
    }

    // Verify token is still valid
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return sendError(res, 'Token is expired or invalid', 'Authentication error', 401);
    }

    const db = getDB();
    let user = null;
    if (db && decoded.payload.userId) {
      user = await db.collection('users').findOne(
        { _id: new ObjectId(decoded.payload.userId) },
        { projection: { password: 0 } }
      );
    }

    return sendSuccess(res, {
      token: {
        header: decoded.header,
        payload: decoded.payload,
        expiresAt: decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : null,
        issuedAt: decoded.payload.iat ? new Date(decoded.payload.iat * 1000).toISOString() : null,
        isExpired: decoded.payload.exp ? decoded.payload.exp * 1000 < Date.now() : false
      },
      user: user ? {
        _id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        emailVerified: user.emailVerified
      } : null
    }, 'Token info retrieved successfully');
  } catch (error) {
    console.error('Get token info error:', error);
    return sendError(res, error, 'Failed to get token info', 500);
  }
});

// Get refresh tokens for current user
router.get('/refresh-tokens', verifyToken, tokenInfoLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const refreshTokens = await db.collection('refresh_tokens')
      .find({ userId: new ObjectId(req.userId) })
      .sort({ createdAt: -1 })
      .toArray();

    return sendSuccess(res, {
      refreshTokens: refreshTokens.map(rt => ({
        _id: rt._id.toString(),
        createdAt: rt.createdAt,
        tokenPreview: rt.token ? `${rt.token.substring(0, 20)}...` : null
      })),
      count: refreshTokens.length
    }, 'Refresh tokens retrieved successfully');
  } catch (error) {
    console.error('Get refresh tokens error:', error);
    return sendError(res, error, 'Failed to get refresh tokens', 500);
  }
});

export default router;

