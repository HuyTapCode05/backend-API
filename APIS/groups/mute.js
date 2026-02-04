import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const muteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/:groupId/mute', verifyToken, muteLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { duration } = req.body;

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

    const isMember = group.members.some(m => m.userId === req.userId);
    
    if (!isMember) {
      return sendError(res, 'You are not a member of this group', 'Validation error', 400);
    }

    let unmuteAt = null;
    if (duration) {
      const hours = parseInt(duration);
      if (isNaN(hours) || hours < 1 || hours > 8760) {
        return sendError(res, 'duration must be between 1 and 8760 hours (1 year)', 'Validation error', 400);
      }
      unmuteAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }

    const muteData = {
      userId: req.userId,
      groupId: groupId,
      mutedAt: new Date().toISOString(),
      unmuteAt: unmuteAt,
      isMuted: true
    };

    await db.collection('group_mutes').updateOne(
      { userId: req.userId, groupId: groupId },
      { $set: muteData },
      { upsert: true }
    );

    return sendSuccess(res, {
      groupId: groupId,
      groupName: group.name,
      mutedAt: muteData.mutedAt,
      unmuteAt: unmuteAt,
      isPermanent: !unmuteAt
    }, 'Group muted successfully');
  } catch (error) {
    console.error('Mute group error:', error);
    return sendError(res, error, 'Failed to mute group', 500);
  }
});

router.post('/:groupId/unmute', verifyToken, muteLimiter, async (req, res) => {
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

    const muteRecord = await db.collection('group_mutes').findOne({
      userId: req.userId,
      groupId: groupId
    });

    if (!muteRecord || !muteRecord.isMuted) {
      return sendError(res, 'Group is not muted', 'Validation error', 400);
    }

    await db.collection('group_mutes').updateOne(
      { userId: req.userId, groupId: groupId },
      { 
        $set: { 
          isMuted: false,
          unmutedAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, {
      groupId: groupId,
      groupName: group.name
    }, 'Group unmuted successfully');
  } catch (error) {
    console.error('Unmute group error:', error);
    return sendError(res, error, 'Failed to unmute group', 500);
  }
});

router.get('/:groupId/mute-status', verifyToken, muteLimiter, async (req, res) => {
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

    const muteRecord = await db.collection('group_mutes').findOne({
      userId: req.userId,
      groupId: groupId
    });

    const isMuted = muteRecord?.isMuted === true;
    let shouldUnmute = false;

    if (isMuted && muteRecord.unmuteAt) {
      if (new Date(muteRecord.unmuteAt) < new Date()) {
        shouldUnmute = true;
        await db.collection('group_mutes').updateOne(
          { userId: req.userId, groupId: groupId },
          { $set: { isMuted: false, unmutedAt: new Date().toISOString() } }
        );
      }
    }

    return sendSuccess(res, {
      groupId: groupId,
      isMuted: shouldUnmute ? false : isMuted,
      mutedAt: muteRecord?.mutedAt || null,
      unmuteAt: muteRecord?.unmuteAt || null
    }, 'Mute status retrieved successfully');
  } catch (error) {
    console.error('Get mute status error:', error);
    return sendError(res, error, 'Failed to get mute status', 500);
  }
});

router.get('/muted', verifyToken, muteLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const mutedGroups = await db.collection('group_mutes')
      .find({ 
        userId: req.userId,
        isMuted: true
      })
      .sort({ mutedAt: -1 })
      .toArray();

    const groupIds = mutedGroups.map(m => new ObjectId(m.groupId));
    const groups = await db.collection('groups')
      .find({ _id: { $in: groupIds } })
      .project({ name: 1, avatar: 1, memberCount: 1 })
      .toArray();

    const result = mutedGroups.map(mute => {
      const group = groups.find(g => g._id.toString() === mute.groupId);
      return {
        groupId: mute.groupId,
        groupName: group?.name || 'Unknown',
        groupAvatar: group?.avatar || null,
        memberCount: group?.memberCount || 0,
        mutedAt: mute.mutedAt,
        unmuteAt: mute.unmuteAt
      };
    });

    return sendSuccess(res, {
      mutedGroups: result,
      total: result.length
    }, 'Muted groups retrieved successfully');
  } catch (error) {
    console.error('Get muted groups error:', error);
    return sendError(res, error, 'Failed to get muted groups', 500);
  }
});

export default router;

