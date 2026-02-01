import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const getGroupLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:groupId', verifyToken, getGroupLimiter, async (req, res) => {
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
    const isAdmin = group.admins.includes(req.userId);
    const isOwner = group.owner === req.userId;

    if (group.isPrivate && !isMember) {
      return sendError(res, 'Access denied. This is a private group.', 'Forbidden', 403);
    }

    const owner = await db.collection('users')
      .findOne({ _id: new ObjectId(group.owner) }, { projection: { password: 0, username: 1, avatar: 1, email: 1 } });

    const enrichedGroup = {
      _id: group._id.toString(),
      name: group.name,
      description: group.description,
      avatar: group.avatar,
      owner: {
        userId: group.owner,
        username: owner?.username || null,
        avatar: owner?.avatar || null
      },
      admins: group.admins,
      members: group.members.map(m => ({
        userId: m.userId,
        username: m.username,
        avatar: m.avatar,
        role: m.role,
        joinedAt: m.joinedAt
      })),
      memberCount: group.memberCount,
      isPrivate: group.isPrivate,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      isMember,
      isAdmin,
      isOwner,
      myRole: isOwner ? 'owner' : isAdmin ? 'admin' : isMember ? 'member' : null
    };

    return sendSuccess(res, enrichedGroup, 'Group retrieved successfully');
  } catch (error) {
    console.error('Get group error:', error);
    return sendError(res, error, 'Failed to get group', 500);
  }
});

export default router;

