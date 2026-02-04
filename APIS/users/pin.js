import express from 'express';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { sanitizeString, whitelistObject } from '../utils/validation.js';
import { signPinToken } from '../utils/userPin.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const pinLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

function validatePin(pin) {
  const p = sanitizeString(pin || '');
  if (!/^\d{4,8}$/.test(p)) {
    return { ok: false, error: 'PIN must be 4-8 digits' };
  }
  return { ok: true, pin: p };
}

router.post('/pin/set', verifyToken, pinLimiter, async (req, res) => {
  try {
    const body = whitelistObject(req.body, ['pin', 'oldPin']);
    const pinCheck = validatePin(body.pin);
    const oldPin = body.oldPin ? sanitizeString(body.oldPin) : null;

    if (!pinCheck.ok) {
      return sendError(res, pinCheck.error, 'Validation error', 400);
    }

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) }, { projection: { pinHash: 1 } });
    if (!user) return sendError(res, 'User not found', 'Not found', 404);

    if (user.pinHash) {
      if (!oldPin) {
        return sendError(res, 'oldPin is required to change PIN', 'Validation error', 400);
      }
      const ok = await bcrypt.compare(oldPin, user.pinHash);
      if (!ok) {
        return sendError(res, 'Invalid old PIN', 'Validation error', 400);
      }
    }

    const pinHash = await bcrypt.hash(pinCheck.pin, 10);
    const now = new Date().toISOString();
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      { $set: { pinHash, pinUpdatedAt: now, updatedAt: now } }
    );

    return sendSuccess(res, { hasPin: true }, 'PIN set successfully');
  } catch (error) {
    console.error('Set PIN error:', error);
    return sendError(res, error, 'Failed to set PIN', 500);
  }
});

router.post('/pin/verify', verifyToken, pinLimiter, async (req, res) => {
  try {
    const body = whitelistObject(req.body, ['pin']);
    const pinCheck = validatePin(body.pin);

    if (!pinCheck.ok) {
      return sendError(res, pinCheck.error, 'Validation error', 400);
    }

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) }, { projection: { pinHash: 1 } });
    if (!user) return sendError(res, 'User not found', 'Not found', 404);
    if (!user.pinHash) return sendError(res, 'PIN is not set', 'Validation error', 400);

    const ok = await bcrypt.compare(pinCheck.pin, user.pinHash);
    if (!ok) {
      return sendError(res, 'Invalid PIN', 'Validation error', 400);
    }

    const pinToken = signPinToken(req.userId, '15m');
    return sendSuccess(res, { pinToken, expiresIn: '15m' }, 'PIN verified');
  } catch (error) {
    console.error('Verify PIN error:', error);
    return sendError(res, error, 'Failed to verify PIN', 500);
  }
});

router.get('/pin/status', verifyToken, pinLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) }, { projection: { pinHash: 1, pinUpdatedAt: 1 } });
    if (!user) return sendError(res, 'User not found', 'Not found', 404);

    return sendSuccess(res, { hasPin: !!user.pinHash, pinUpdatedAt: user.pinUpdatedAt || null }, 'PIN status retrieved');
  } catch (error) {
    console.error('PIN status error:', error);
    return sendError(res, error, 'Failed to get PIN status', 500);
  }
});

export default router;


