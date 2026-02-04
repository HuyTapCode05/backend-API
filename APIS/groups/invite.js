import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const router = express.Router();

const inviteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

function generateInviteCode() {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}

router.post('/:groupId/invite-code', verifyToken, inviteLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { expiresIn } = req.body;

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const group = await db.collection('groups').findOne({ _id: new ObjectId(groupId) });

    if (!group) {
      return sendError(res, 'Group not found', 'Not found', 404);
    }

    const isOwner = group.owner === req.userId;
    const isAdmin = group.admins.includes(req.userId);

    if (!isOwner && !isAdmin) {
      return sendError(res, 'Only owner or admin can generate invite codes', 'Forbidden', 403);
    }

    let expiresAt = null;
    if (expiresIn) {
      const hours = parseInt(expiresIn);
      if (isNaN(hours) || hours < 1 || hours > 720) {
        return sendError(res, 'expiresIn must be between 1 and 720 hours', 'Validation error', 400);
      }
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }

    const inviteCode = generateInviteCode();
    const inviteData = {
      code: inviteCode,
      groupId: groupId,
      createdBy: req.userId,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt,
      isActive: true,
      usageCount: 0,
      maxUses: null
    };

    await db.collection('group_invites').insertOne(inviteData);

    return sendSuccess(res, {
      code: inviteCode,
      groupId: groupId,
      groupName: group.name,
      expiresAt: expiresAt,
      inviteLink: `/api/groups/join-by-code?code=${inviteCode}`
    }, 'Invite code generated successfully');
  } catch (error) {
    console.error('Generate invite code error:', error);
    return sendError(res, error, 'Failed to generate invite code', 500);
  }
});

router.post('/join-by-code', verifyToken, inviteLimiter, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return sendError(res, 'Invite code is required', 'Validation error', 400);
    }

    const inviteCode = code.trim().toUpperCase();

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const invite = await db.collection('group_invites').findOne({ code: inviteCode });

    if (!invite) {
      return sendError(res, 'Invalid invite code', 'Not found', 404);
    }

    if (!invite.isActive) {
      return sendError(res, 'This invite code has been deactivated', 'Validation error', 400);
    }

    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return sendError(res, 'This invite code has expired', 'Validation error', 400);
    }

    if (invite.maxUses && invite.usageCount >= invite.maxUses) {
      return sendError(res, 'This invite code has reached its usage limit', 'Validation error', 400);
    }

    const group = await db.collection('groups').findOne({ _id: new ObjectId(invite.groupId) });

    if (!group) {
      return sendError(res, 'Group not found', 'Not found', 404);
    }

    const isMember = group.members.some(m => m.userId === req.userId);

    if (isMember) {
      return sendError(res, 'You are already a member of this group', 'Validation error', 400);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const newMember = {
      userId: req.userId,
      username: user.username,
      avatar: user.avatar || null,
      role: 'member',
      joinedAt: new Date().toISOString()
    };

    await db.collection('groups').updateOne(
      { _id: new ObjectId(invite.groupId) },
      {
        $push: { members: newMember },
        $set: {
          memberCount: group.memberCount + 1,
          updatedAt: new Date().toISOString()
        }
      }
    );

    await db.collection('group_invites').updateOne(
      { code: inviteCode },
      {
        $inc: { usageCount: 1 }
      }
    );

    return sendSuccess(res, {
      groupId: invite.groupId,
      groupName: group.name,
      member: newMember
    }, 'Successfully joined the group');
  } catch (error) {
    console.error('Join by code error:', error);
    return sendError(res, error, 'Failed to join group', 500);
  }
});

router.get('/:groupId/invite-codes', verifyToken, inviteLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const group = await db.collection('groups').findOne({ _id: new ObjectId(groupId) });

    if (!group) {
      return sendError(res, 'Group not found', 'Not found', 404);
    }

    const isOwner = group.owner === req.userId;
    const isAdmin = group.admins.includes(req.userId);

    if (!isOwner && !isAdmin) {
      return sendError(res, 'Only owner or admin can view invite codes', 'Forbidden', 403);
    }

    const invites = await db.collection('group_invites')
      .find({ groupId: groupId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return sendSuccess(res, {
      invites: invites.map(invite => ({
        code: invite.code,
        createdBy: invite.createdBy,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        isActive: invite.isActive,
        usageCount: invite.usageCount,
        maxUses: invite.maxUses
      })),
      total: invites.length
    }, 'Invite codes retrieved successfully');
  } catch (error) {
    console.error('Get invite codes error:', error);
    return sendError(res, error, 'Failed to get invite codes', 500);
  }
});

router.delete('/:groupId/invite-code/:code', verifyToken, inviteLimiter, async (req, res) => {
  try {
    const { groupId, code } = req.params;

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    const inviteCode = code.toUpperCase();

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const group = await db.collection('groups').findOne({ _id: new ObjectId(groupId) });

    if (!group) {
      return sendError(res, 'Group not found', 'Not found', 404);
    }

    const isOwner = group.owner === req.userId;
    const isAdmin = group.admins.includes(req.userId);

    if (!isOwner && !isAdmin) {
      return sendError(res, 'Only owner or admin can deactivate invite codes', 'Forbidden', 403);
    }

    const invite = await db.collection('group_invites').findOne({
      code: inviteCode,
      groupId: groupId
    });

    if (!invite) {
      return sendError(res, 'Invite code not found', 'Not found', 404);
    }

    await db.collection('group_invites').updateOne(
      { code: inviteCode },
      { $set: { isActive: false } }
    );

    return sendSuccess(res, { code: inviteCode }, 'Invite code deactivated successfully');
  } catch (error) {
    console.error('Deactivate invite code error:', error);
    return sendError(res, error, 'Failed to deactivate invite code', 500);
  }
});

export default router;

