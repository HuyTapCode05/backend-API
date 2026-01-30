import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendError(res, 'Username and password are required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne({
      $or: [{ username }, { email: username }]
    });

    if (!user) {
      return sendError(res, 'Invalid username or password', 'Authentication error', 401);
    }

    if (user.locked || user.disabled) {
      return sendError(res, 'Account is locked or disabled', 'Authentication error', 403);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return sendError(res, 'Invalid username or password', 'Authentication error', 401);
    }

    const accessToken = jwt.sign(
      { userId: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const refreshToken = jwt.sign(
      { userId: user._id.toString(), username: user.username, type: 'refresh_token' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await db.collection('refresh_tokens').insertOne({
      userId: user._id,
      token: refreshToken,
      createdAt: new Date().toISOString()
    });

    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    };

    return sendSuccess(res, {
      user: userResponse,
      accessToken,
      refreshToken
    }, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    return sendError(res, error, 'Login failed', 500);
  }
});

export default router;

