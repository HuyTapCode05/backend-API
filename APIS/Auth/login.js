import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { logActivity } from '../users/activityLog.js';

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

    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    let deviceName = 'Unknown Device';
    let deviceType = 'unknown';
    let os = 'unknown';
    let browser = 'unknown';

    if (userAgent) {
      if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
        deviceType = 'mobile';
        if (userAgent.includes('Android')) {
          os = 'Android';
          const match = userAgent.match(/Android\s([\d.]+)/);
          if (match) os += ` ${match[1]}`;
        } else if (userAgent.includes('iPhone')) {
          os = 'iOS';
          const match = userAgent.match(/OS\s([\d_]+)/);
          if (match) os += ` ${match[1].replace(/_/g, '.')}`;
        }
      } else {
        deviceType = 'desktop';
        if (userAgent.includes('Windows')) {
          os = 'Windows';
          const match = userAgent.match(/Windows NT ([\d.]+)/);
          if (match) os += ` ${match[1]}`;
        } else if (userAgent.includes('Mac')) {
          os = 'macOS';
          const match = userAgent.match(/Mac OS X ([\d_]+)/);
          if (match) os += ` ${match[1].replace(/_/g, '.')}`;
        } else if (userAgent.includes('Linux')) {
          os = 'Linux';
        }
      }

      if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
        browser = 'Chrome';
        const match = userAgent.match(/Chrome\/([\d.]+)/);
        if (match) browser += ` ${match[1]}`;
      } else if (userAgent.includes('Firefox')) {
        browser = 'Firefox';
        const match = userAgent.match(/Firefox\/([\d.]+)/);
        if (match) browser += ` ${match[1]}`;
      } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        browser = 'Safari';
        const match = userAgent.match(/Version\/([\d.]+)/);
        if (match) browser += ` ${match[1]}`;
      } else if (userAgent.includes('Edg')) {
        browser = 'Edge';
        const match = userAgent.match(/Edg\/([\d.]+)/);
        if (match) browser += ` ${match[1]}`;
      }

      deviceName = `${os} - ${browser}`;
    }

    const deviceInfo = `${userAgent}|${ip}`;
    const deviceId = crypto.createHash('sha256').update(deviceInfo).digest('hex').substring(0, 16);

    await db.collection('refresh_tokens').insertOne({
      userId: user._id,
      token: refreshToken,
      deviceId,
      createdAt: new Date().toISOString()
    });

    const now = new Date().toISOString();
    await db.collection('device_sessions').updateOne(
      { userId: user._id.toString(), deviceId },
      {
        $set: {
          deviceName,
          deviceType,
          os,
          browser,
          userAgent,
          ip,
          lastActiveAt: now
        },
        $setOnInsert: {
          userId: user._id.toString(),
          deviceId,
          firstLoginAt: now,
          isBlocked: false
        }
      },
      { upsert: true }
    );

    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    };

    // Log login activity (non-blocking)
    logActivity(user._id.toString(), 'login', {
      ip: req.ip || req.connection?.remoteAddress,
      userAgent,
      deviceName,
      deviceType,
      os,
      browser
    }).catch(() => { });

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

