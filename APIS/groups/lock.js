import express from 'express';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId, sanitizeString, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const lockLimiter = rateLimit({
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

async function requireAdminOrOwner(db, groupId, userId) {
  const group = await db.collection('groups').findOne({ _id: new ObjectId(groupId) });
  if (!group) return { ok: false, status: 404, error: 'Group not found' };
  const isOwner = group.owner === userId;
  const isAdmin = group.admins?.includes(userId);
  const isMember = group.members?.some(m => m.userId === userId);
  return { ok: true, group, isOwner, isAdmin, isMember };
}

router.post('/:groupId/lock', verifyToken, lockLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;
    const body = whitelistObject(req.body, ['pin']);
    const pinCheck = validatePin(body.pin);

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }
    if (!pinCheck.ok) {
      return sendError(res, pinCheck.error, 'Validation error', 400);
    }

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const perm = await requireAdminOrOwner(db, groupId, req.userId);
    if (!perm.ok) return sendError(res, perm.error, 'Not found', perm.status);
    if (!perm.isOwner && !perm.isAdmin) {
      return sendError(res, 'Only owner or admin can lock the group', 'Forbidden', 403);
    }

    const hash = await bcrypt.hash(pinCheck.pin, 10);
    const now = new Date().toISOString();
    await db.collection('groups').updateOne(
      { _id: new ObjectId(groupId) },
      { $set: { isLocked: true, lockPinHash: hash, lockedBy: req.userId, lockedAt: now, updatedAt: now } }
    );

    // Auto-unlock for the admin/owner who set the PIN (7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.collection('group_unlocks').updateOne(
      { groupId, userId: req.userId },
      { $set: { groupId, userId: req.userId, unlockedAt: now, expiresAt, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    return sendSuccess(res, { groupId, isLocked: true, expiresAt }, 'Group locked successfully');
  } catch (error) {
    console.error('Lock group error:', error);
    return sendError(res, error, 'Failed to lock group', 500);
  }
});

router.delete('/:groupId/lock', verifyToken, lockLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const perm = await requireAdminOrOwner(db, groupId, req.userId);
    if (!perm.ok) return sendError(res, perm.error, 'Not found', perm.status);
    if (!perm.isOwner && !perm.isAdmin) {
      return sendError(res, 'Only owner or admin can unlock the group', 'Forbidden', 403);
    }

    const now = new Date().toISOString();
    await db.collection('groups').updateOne(
      { _id: new ObjectId(groupId) },
      { $set: { isLocked: false, updatedAt: now }, $unset: { lockPinHash: '', lockedBy: '', lockedAt: '' } }
    );

    await db.collection('group_unlocks').deleteMany({ groupId });

    return sendSuccess(res, { groupId, isLocked: false }, 'Group lock removed successfully');
  } catch (error) {
    console.error('Remove group lock error:', error);
    return sendError(res, error, 'Failed to remove group lock', 500);
  }
});

router.post('/:groupId/unlock', verifyToken, lockLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;
    const body = whitelistObject(req.body, ['pin']);
    const pinCheck = validatePin(body.pin);

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }
    if (!pinCheck.ok) {
      return sendError(res, pinCheck.error, 'Validation error', 400);
    }

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const group = await db.collection('groups').findOne({ _id: new ObjectId(groupId) });
    if (!group) return sendError(res, 'Group not found', 'Not found', 404);

    const isMember = group.members?.some(m => m.userId === req.userId);
    if (!isMember) {
      return sendError(res, 'You are not a member of this group', 'Forbidden', 403);
    }

    if (!group.isLocked) {
      return sendSuccess(res, { groupId, isLocked: false, isUnlocked: true }, 'Group is not locked');
    }

    if (!group.lockPinHash) {
      return sendError(res, 'Group lock is misconfigured', 'Server error', 500);
    }

    const ok = await bcrypt.compare(pinCheck.pin, group.lockPinHash);
    if (!ok) {
      return sendError(res, 'Invalid PIN', 'Validation error', 400);
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.collection('group_unlocks').updateOne(
      { groupId, userId: req.userId },
      { $set: { groupId, userId: req.userId, unlockedAt: now, expiresAt, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    return sendSuccess(res, { groupId, isLocked: true, isUnlocked: true, expiresAt }, 'Group unlocked successfully');
  } catch (error) {
    console.error('Unlock group error:', error);
    return sendError(res, error, 'Failed to unlock group', 500);
  }
});

router.get('/:groupId/lock-status', verifyToken, lockLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) return sendError(res, 'Database not connected', 'Server error', 500);

    const group = await db.collection('groups').findOne({ _id: new ObjectId(groupId) }, { projection: { isLocked: 1, members: 1 } });
    if (!group) return sendError(res, 'Group not found', 'Not found', 404);

    const isMember = group.members?.some(m => m.userId === req.userId);
    if (!isMember) {
      return sendError(res, 'You are not a member of this group', 'Forbidden', 403);
    }

    const isLocked = group.isLocked === true;
    let isUnlocked = true;
    let expiresAt = null;
    if (isLocked) {
      const unlock = await db.collection('group_unlocks').findOne({ groupId, userId: req.userId });
      expiresAt = unlock?.expiresAt || null;
      isUnlocked = !!(unlock && unlock.expiresAt && new Date(unlock.expiresAt) > new Date());
    }

    return sendSuccess(res, { groupId, isLocked, isUnlocked, expiresAt }, 'Lock status retrieved successfully');
  } catch (error) {
    console.error('Get lock status error:', error);
    return sendError(res, error, 'Failed to get lock status', 500);
  }
});

export default router;


