import express from 'express';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, sanitizeString } from '../utils/validation.js';
import { assertPinVerified, isRoomHiddenForUser } from '../utils/userPin.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const hiddenLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 40,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/hidden/rooms/:roomId/hide', verifyToken, hiddenLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;
    const rid = sanitizeString(roomId);
    if (!isValidRoomId(rid)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    // Require PIN verification to hide (like Zalo)
    const ok = await assertPinVerified(req, res);
    if (!ok) return;

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const now = new Date().toISOString();
    await db.collection('hidden_rooms').updateOne(
      { userId: req.userId, roomId: rid },
      {
        $set: { userId: req.userId, roomId: rid, isHidden: true, hiddenAt: now, updatedAt: now },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );

    return sendSuccess(res, { roomId: rid, isHidden: true }, 'Room hidden successfully');
  } catch (error) {
    console.error('Hide room error:', error);
    return sendError(res, error, 'Failed to hide room', 500);
  }
});

router.post('/hidden/rooms/:roomId/unhide', verifyToken, hiddenLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;
    const rid = sanitizeString(roomId);
    if (!isValidRoomId(rid)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const ok = await assertPinVerified(req, res);
    if (!ok) return;

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const exists = await isRoomHiddenForUser(req.userId, rid);
    if (!exists) {
      return sendError(res, 'Room is not hidden', 'Not found', 404);
    }

    const now = new Date().toISOString();
    await db.collection('hidden_rooms').updateOne(
      { userId: req.userId, roomId: rid },
      { $set: { isHidden: false, unhiddenAt: now, updatedAt: now } }
    );

    return sendSuccess(res, { roomId: rid, isHidden: false }, 'Room unhidden successfully');
  } catch (error) {
    console.error('Unhide room error:', error);
    return sendError(res, error, 'Failed to unhide room', 500);
  }
});

router.get('/hidden/rooms', verifyToken, hiddenLimiter, async (req, res) => {
  try {
    const ok = await assertPinVerified(req, res);
    if (!ok) return;

    const { limit = 50, skip = 0 } = req.query;

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const rooms = await db.collection('hidden_rooms')
      .find({ userId: req.userId, isHidden: true })
      .sort({ hiddenAt: -1 })
      .limit(Math.min(parseInt(limit) || 50, 100))
      .skip(Math.max(parseInt(skip) || 0, 0))
      .toArray();

    return sendSuccess(res, { rooms, total: rooms.length }, 'Hidden rooms retrieved successfully');
  } catch (error) {
    console.error('List hidden rooms error:', error);
    return sendError(res, error, 'Failed to list hidden rooms', 500);
  }
});

router.get('/hidden/rooms/:roomId/status', verifyToken, hiddenLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;
    const rid = sanitizeString(roomId);
    if (!isValidRoomId(rid)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const record = await db.collection('hidden_rooms').findOne({ userId: req.userId, roomId: rid });
    return sendSuccess(res, { roomId: rid, isHidden: record?.isHidden === true }, 'Hidden status retrieved');
  } catch (error) {
    console.error('Hidden status error:', error);
    return sendError(res, error, 'Failed to get hidden status', 500);
  }
});

export default router;


