import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendVerificationEmail } from '../../config/email.js';
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

router.post('/verify-email', async (req, res) => {
  try {
    const { token, code } = req.body;

    if (!token && !code) {
      return sendError(res, 'Verification token or code is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    let verification;

    // Verify by token
    if (token) {
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'email_verification') {
          return sendError(res, 'Invalid token type', 'Validation error', 400);
        }
      } catch (error) {
        return sendError(res, 'Invalid or expired token', 'Validation error', 400);
      }

      verification = await db.collection('email_verifications').findOne({
        token,
        email: decoded.email
      });
    } 

    else if (code) {
      verification = await db.collection('email_verifications').findOne({
        code: code.toString()
      });
    }

    if (!verification) {
      return sendError(res, 'Verification token or code not found', 'Validation error', 404);
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(verification.userId) },
      { $set: { emailVerified: true } }
    );

    await db.collection('email_verifications').deleteOne({ 
      _id: verification._id 
    });

    return sendSuccess(res, null, 'Email verified successfully');
  } catch (error) {
    console.error('Verify email error:', error);
    return sendError(res, error, 'Email verification failed', 500);
  }
});

router.post('/resend-verification', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, 'Email is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne({ email });

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    if (user.emailVerified) {
      return sendError(res, 'Email already verified', 'Validation error', 400);
    }

    const emailToken = jwt.sign(
      { email, type: 'email_verification' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    await db.collection('email_verifications').updateOne(
      { userId: user._id },
      {
        $set: {
          token: emailToken,
          code: verificationCode,
          email,
          createdAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    const emailSent = await sendVerificationEmail(email, user.username, verificationCode);
    if (!emailSent) {
      console.warn(`⚠️  Failed to send verification email to ${email}`);
    }

    const responseData = {};
    if (!emailSent) {
      responseData.emailVerificationToken = emailToken;
      responseData.verificationCode = verificationCode;
    }

    return sendSuccess(res, responseData, 
      emailSent 
        ? 'Verification email sent' 
        : 'Verification email sent. (Email service not configured)');
  } catch (error) {
    console.error('Resend verification error:', error);
    return sendError(res, error, 'Failed to resend verification', 500);
  }
});

export default router;

