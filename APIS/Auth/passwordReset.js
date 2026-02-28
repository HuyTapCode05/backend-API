import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendPasswordResetEmail } from '../../config/email.js';
import { sendSuccess, sendError } from '../utils/response.js';
import rateLimit from 'express-rate-limit';
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
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, 'Email is required', 'Validation error', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendError(res, 'Invalid email format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne({ email });

    if (!user) {
      return sendSuccess(res, null, 'If email exists, password reset link has been sent');
    }

    const resetToken = jwt.sign(
      { userId: user._id.toString(), email, type: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    await db.collection('password_resets').updateOne(
      { userId: user._id },
      {
        $set: {
          token: resetToken,
          code: resetCode,
          email,
          createdAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    const emailSent = await sendPasswordResetEmail(email, user.username, resetCode);
    if (!emailSent) {
      console.warn(`⚠️  Failed to send password reset email to ${email}`);
    }

    const responseData = {};
    if (!emailSent) {
      responseData.resetToken = resetToken;
      responseData.resetCode = resetCode;
      console.warn('⚠️  Email not sent, reset code included in response for testing');
    }

    return sendSuccess(res, responseData,
      emailSent
        ? 'If email exists, password reset code has been sent to your email.'
        : 'If email exists, password reset link has been sent. (Email service not configured)');
  } catch (error) {
    console.error('Forgot password error:', error);
    return sendError(res, error, 'Failed to process password reset request', 500);
  }
});
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, code, newPassword } = req.body;

    if ((!token && !code) || !newPassword) {
      return sendError(res, 'Token or code and new password are required', 'Validation error', 400);
    }

    if (newPassword.length < 6) {
      return sendError(res, 'Password must be at least 6 characters', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    let resetRecord;
    let userId;

    if (token) {
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'password_reset') {
          return sendError(res, 'Invalid token type', 'Validation error', 400);
        }
        userId = decoded.userId;
      } catch (error) {
        return sendError(res, 'Invalid or expired token', 'Validation error', 400);
      }

      resetRecord = await db.collection('password_resets').findOne({
        token,
        userId: new ObjectId(userId)
      });
    } else if (code) {
      resetRecord = await db.collection('password_resets').findOne({
        code: code.toString()
      });
      if (resetRecord) {
        userId = resetRecord.userId.toString();
      }
    }

    if (!resetRecord) {
      return sendError(res, 'Reset token or code not found or already used', 'Validation error', 404);
    }

    const createdAt = new Date(resetRecord.createdAt);
    const now = new Date();
    if (now - createdAt > 60 * 60 * 1000) {
      await db.collection('password_resets').deleteOne({ _id: resetRecord._id });
      return sendError(res, 'Reset token or code has expired', 'Validation error', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const targetUserId = new ObjectId(userId || resetRecord.userId);

    await db.collection('users').updateOne(
      { _id: targetUserId },
      { $set: { password: hashedPassword } }
    );

    await db.collection('refresh_tokens').deleteMany({ userId: targetUserId });

    await db.collection('password_resets').deleteOne({ _id: resetRecord._id });

    // Log password reset activity (non-blocking)
    logActivity(targetUserId.toString(), 'password_reset', {
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    }).catch(() => { });

    return sendSuccess(res, null, 'Password reset successfully. All sessions have been invalidated.');
  } catch (error) {
    console.error('Reset password error:', error);
    return sendError(res, error, 'Failed to reset password', 500);
  }
});

export default router;

