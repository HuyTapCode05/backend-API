import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const keyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// List all API keys for current user
router.get('/list', verifyToken, keyLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const keys = await db.collection('api_keys')
      .find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .toArray();

    return sendSuccess(res, {
      keys: keys.map(key => ({
        _id: key._id.toString(),
        name: key.name,
        description: key.description,
        lastUsed: key.lastUsed,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        isActive: key.isActive,
        keyPreview: `sk_...${key.keyHash.substring(key.keyHash.length - 8)}`
      })),
      count: keys.length
    }, 'API keys retrieved successfully');
  } catch (error) {
    console.error('List API keys error:', error);
    return sendError(res, error, 'Failed to list API keys', 500);
  }
});

export default router;

