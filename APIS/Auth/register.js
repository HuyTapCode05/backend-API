import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendVerificationEmail } from '../../config/email.js';
import { sendSuccess, sendError } from '../utils/response.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const registerLimiter = rateLimit({
  // Dev-friendly: 1 minute window, 20 requests
  // (vẫn bảo vệ brute-force nhưng đỡ khó chịu khi test)
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many registration attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return sendError(res, 'Username, password, and email are required', 'Validation error', 400);
    }

    if (username.length < 3 || username.length > 20) {
      return sendError(res, 'Username must be between 3 and 20 characters', 'Validation error', 400);
    }

    if (password.length < 6) {
      return sendError(res, 'Password must be at least 6 characters', 'Validation error', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendError(res, 'Invalid email format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const existingUser = await db.collection('users').findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return sendError(res, 'Username or email already exists', 'Conflict', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const emailToken = jwt.sign(
      { email, type: 'email_verification' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const user = {
      username,
      email,
      password: hashedPassword,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      avatar: null
    };

    const result = await db.collection('users').insertOne(user);
    user._id = result.insertedId;

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    await db.collection('email_verifications').insertOne({
      userId: user._id,
      email,
      token: emailToken,
      code: verificationCode,
      createdAt: new Date().toISOString()
    });

    const emailSent = await sendVerificationEmail(email, username, verificationCode);

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

    delete user.password;

    const responseData = {
      user,
      accessToken,
      refreshToken
    };

    if (!emailSent) {
      responseData.emailVerificationToken = emailToken;
      responseData.verificationCode = verificationCode;
    }

    return sendSuccess(res, responseData, 
      emailSent 
        ? 'Registration successful. Please check your email for verification code.' 
        : 'Registration successful. Please verify your email. (Email service not configured)',
      201);
  } catch (error) {
    console.error('Register error:', error);
    return sendError(res, error, 'Registration failed', 500);
  }
});

export default router;

