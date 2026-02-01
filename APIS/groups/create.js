import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { sanitizeString, validateText, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const createGroupLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: 'Too many group creation requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', verifyToken, createGroupLimiter, async (req, res) => {
  try {
    const allowedFields = ['name', 'description', 'avatar', 'isPrivate', 'memberIds'];
    const body = whitelistObject(req.body, allowedFields);
    let { name, description, avatar, isPrivate, memberIds } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError(res, 'Group name is required', 'Validation error', 400);
    }

    name = sanitizeString(name.trim());
    if (name.length < 3 || name.length > 50) {
      return sendError(res, 'Group name must be between 3 and 50 characters', 'Validation error', 400);
    }

    if (description) {
      try {
        description = validateText(description, 500);
      } catch (error) {
        return sendError(res, error.message, 'Validation error', 400);
      }
    }

    if (avatar) {
      avatar = sanitizeString(avatar);
      if (!avatar.startsWith('/') && !avatar.startsWith('http://') && !avatar.startsWith('https://')) {
        return sendError(res, 'Invalid avatar URL format', 'Validation error', 400);
      }
    }

    const privateGroup = isPrivate === true || isPrivate === 'true';

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const existingGroup = await db.collection('groups').findOne({ name });
    if (existingGroup) {
      return sendError(res, 'Group name already exists', 'Validation error', 400);
    }

    const members = [{
      userId: req.userId,
      username: user.username,
      avatar: user.avatar || null,
      role: 'owner',
      joinedAt: new Date().toISOString()
    }];

    if (memberIds && Array.isArray(memberIds)) {
      const validMemberIds = memberIds
        .filter(id => id && typeof id === 'string')
        .slice(0, 100);

      if (validMemberIds.length > 0) {
        const memberUsers = await db.collection('users')
          .find({ _id: { $in: validMemberIds.map(id => new ObjectId(id)) } })
          .project({ password: 0, username: 1, avatar: 1, email: 1 })
          .toArray();

        memberUsers.forEach(memberUser => {
          if (memberUser._id.toString() !== req.userId) {
            members.push({
              userId: memberUser._id.toString(),
              username: memberUser.username,
              avatar: memberUser.avatar || null,
              role: 'member',
              joinedAt: new Date().toISOString()
            });
          }
        });
      }
    }

    const group = {
      _id: new ObjectId(),
      name,
      description: description || null,
      avatar: avatar || null,
      owner: req.userId,
      admins: [req.userId],
      members: members,
      memberCount: members.length,
      isPrivate: privateGroup,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.collection('groups').insertOne(group);

    return sendSuccess(res, {
      ...group,
      _id: group._id.toString()
    }, 'Group created successfully');
  } catch (error) {
    console.error('Create group error:', error);
    return sendError(res, error, 'Failed to create group', 500);
  }
});

export default router;

