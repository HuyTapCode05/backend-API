import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const membersLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:groupId/members', verifyToken, membersLimiter, async (req, res) => {
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

    const isMember = group.members.some(m => m.userId === req.userId);

    if (group.isPrivate && !isMember) {
      return sendError(res, 'Access denied. This is a private group.', 'Forbidden', 403);
    }

    return sendSuccess(res, {
      members: group.members,
      total: group.memberCount,
      owner: group.owner,
      admins: group.admins
    }, 'Members retrieved successfully');
  } catch (error) {
    console.error('Get members error:', error);
    return sendError(res, error, 'Failed to get members', 500);
  }
});

router.post('/:groupId/members', verifyToken, membersLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    if (!userId || !isValidObjectId(userId)) {
      return sendError(res, 'Valid user ID is required', 'Validation error', 400);
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
    const isMember = group.members.some(m => m.userId === req.userId);

    if (!isOwner && !isAdmin && group.isPrivate) {
      return sendError(res, 'Only owner or admin can add members to private groups', 'Forbidden', 403);
    }

    if (group.members.some(m => m.userId === userId)) {
      return sendError(res, 'User is already a member of this group', 'Validation error', 400);
    }

    const user = await db.collection('users')
      .findOne({ _id: new ObjectId(userId) }, { projection: { password: 0, username: 1, avatar: 1 } });

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const newMember = {
      userId: userId,
      username: user.username,
      avatar: user.avatar || null,
      role: 'member',
      joinedAt: new Date().toISOString()
    };

    await db.collection('groups').updateOne(
      { _id: new ObjectId(groupId) },
      {
        $push: { members: newMember },
        $set: { 
          memberCount: group.memberCount + 1,
          updatedAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, newMember, 'Member added successfully');
  } catch (error) {
    console.error('Add member error:', error);
    return sendError(res, error, 'Failed to add member', 500);
  }
});

router.delete('/:groupId/members/:userId', verifyToken, membersLimiter, async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    if (!isValidObjectId(userId)) {
      return sendError(res, 'Invalid user ID format', 'Validation error', 400);
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
    const isTargetMember = group.members.some(m => m.userId === userId);

    if (!isTargetMember) {
      return sendError(res, 'User is not a member of this group', 'Validation error', 400);
    }

    if (userId === group.owner) {
      return sendError(res, 'Cannot remove group owner', 'Validation error', 400);
    }

    if (userId !== req.userId && !isOwner && !isAdmin) {
      return sendError(res, 'Only owner or admin can remove members', 'Forbidden', 403);
    }

    if (group.admins.includes(userId) && !isOwner) {
      return sendError(res, 'Only owner can remove admins', 'Forbidden', 403);
    }

    await db.collection('groups').updateOne(
      { _id: new ObjectId(groupId) },
      {
        $pull: { 
          members: { userId: userId },
          admins: userId
        },
        $set: { 
          memberCount: group.memberCount - 1,
          updatedAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, { userId }, 'Member removed successfully');
  } catch (error) {
    console.error('Remove member error:', error);
    return sendError(res, error, 'Failed to remove member', 500);
  }
});

router.post('/:groupId/members/:userId/promote', verifyToken, membersLimiter, async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    if (!isValidObjectId(userId)) {
      return sendError(res, 'Invalid user ID format', 'Validation error', 400);
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

    if (!isOwner) {
      return sendError(res, 'Only owner can promote members to admin', 'Forbidden', 403);
    }

    if (userId === group.owner) {
      return sendError(res, 'Owner cannot be promoted', 'Validation error', 400);
    }

    const isMember = group.members.some(m => m.userId === userId);
    if (!isMember) {
      return sendError(res, 'User is not a member of this group', 'Validation error', 400);
    }

    if (group.admins.includes(userId)) {
      return sendError(res, 'User is already an admin', 'Validation error', 400);
    }

    await db.collection('groups').updateOne(
      { _id: new ObjectId(groupId) },
      {
        $push: { admins: userId },
        $set: { 
          'members.$[elem].role': 'admin',
          updatedAt: new Date().toISOString()
        }
      },
      {
        arrayFilters: [{ 'elem.userId': userId }]
      }
    );

    return sendSuccess(res, { userId }, 'Member promoted to admin successfully');
  } catch (error) {
    console.error('Promote member error:', error);
    return sendError(res, error, 'Failed to promote member', 500);
  }
});

router.post('/:groupId/members/:userId/demote', verifyToken, membersLimiter, async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    if (!isValidObjectId(userId)) {
      return sendError(res, 'Invalid user ID format', 'Validation error', 400);
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

    if (!isOwner) {
      return sendError(res, 'Only owner can demote admins', 'Forbidden', 403);
    }

    if (userId === group.owner) {
      return sendError(res, 'Owner cannot be demoted', 'Validation error', 400);
    }

    if (!group.admins.includes(userId)) {
      return sendError(res, 'User is not an admin', 'Validation error', 400);
    }

    await db.collection('groups').updateOne(
      { _id: new ObjectId(groupId) },
      {
        $pull: { admins: userId },
        $set: { 
          'members.$[elem].role': 'member',
          updatedAt: new Date().toISOString()
        }
      },
      {
        arrayFilters: [{ 'elem.userId': userId }]
      }
    );

    return sendSuccess(res, { userId }, 'Admin demoted to member successfully');
  } catch (error) {
    console.error('Demote admin error:', error);
    return sendError(res, error, 'Failed to demote admin', 500);
  }
});

// Leave Group - Allow members to leave group themselves
router.post('/:groupId/leave', verifyToken, membersLimiter, async (req, res) => {
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

    const isMember = group.members.some(m => m.userId === req.userId);
    
    if (!isMember) {
      return sendError(res, 'You are not a member of this group', 'Validation error', 400);
    }

    // Owner cannot leave group - must transfer ownership or delete group
    if (group.owner === req.userId) {
      return sendError(res, 'Group owner cannot leave. Please transfer ownership or delete the group instead.', 'Validation error', 400);
    }

    // Remove user from members array and admins array (if admin)
    await db.collection('groups').updateOne(
      { _id: new ObjectId(groupId) },
      {
        $pull: { 
          members: { userId: req.userId },
          admins: req.userId
        },
        $set: { 
          memberCount: Math.max(0, group.memberCount - 1),
          updatedAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, { 
      groupId,
      message: 'Successfully left the group'
    }, 'Left group successfully');
  } catch (error) {
    console.error('Leave group error:', error);
    return sendError(res, error, 'Failed to leave group', 500);
  }
});

export default router;

