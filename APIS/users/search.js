import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many search requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/search/:query', verifyToken, searchLimiter, async (req, res) => {
  try {
    let { query } = req.params;
    let { limit = 20 } = req.query;

    query = sanitizeString(query);
    if (!query || query.length < 2) {
      return sendError(res, 'Search query must be at least 2 characters', 'Validation error', 400);
    }

    limit = parseInt(limit);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      limit = 20; // Default to 20 if invalid
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const users = await db.collection('users')
      .find({
        username: { $regex: escapedQuery, $options: 'i' },
        _id: { $ne: new ObjectId(req.userId) }
      })
      .project({ password: 0, email: 0 })
      .limit(limit)
      .toArray();

    const usersResponse = users.map(user => ({
      _id: user._id.toString(),
      id: user._id.toString(),
      userId: user._id.toString(),
      username: user.username,
      avatar: user.avatar || null,
      emailVerified: user.emailVerified || false,
      createdAt: user.createdAt
    }));

    return sendSuccess(res, {
      users: usersResponse,
      total: usersResponse.length
    }, 'Users found successfully');
  } catch (error) {
    console.error('Search users error:', error);
    return sendError(res, error, 'Failed to search users', 500);
  }
});

export default router;

