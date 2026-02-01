import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId, sanitizeString, validateText, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const updateGroupLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many update requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.put('/:groupId', verifyToken, updateGroupLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }

    const allowedFields = ['name', 'description', 'avatar', 'isPrivate'];
    const body = whitelistObject(req.body, allowedFields);
    let { name, description, avatar, isPrivate } = body;

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
      return sendError(res, 'Only owner or admin can update group', 'Forbidden', 403);
    }

    const updateData = { updatedAt: new Date().toISOString() };

    if (name !== undefined) {
      name = sanitizeString(name.trim());
      if (name.length < 3 || name.length > 50) {
        return sendError(res, 'Group name must be between 3 and 50 characters', 'Validation error', 400);
      }

      if (name !== group.name) {
        const existingGroup = await db.collection('groups').findOne({ name, _id: { $ne: new ObjectId(groupId) } });
        if (existingGroup) {
          return sendError(res, 'Group name already exists', 'Validation error', 400);
        }
        updateData.name = name;
      }
    }

    if (description !== undefined) {
      try {
        updateData.description = description ? validateText(description, 500) : null;
      } catch (error) {
        return sendError(res, error.message, 'Validation error', 400);
      }
    }

    if (avatar !== undefined) {
      if (avatar === null || avatar === '') {
        updateData.avatar = null;
      } else {
        avatar = sanitizeString(avatar);
        if (!avatar.startsWith('/') && !avatar.startsWith('http://') && !avatar.startsWith('https://')) {
          return sendError(res, 'Invalid avatar URL format', 'Validation error', 400);
        }
        updateData.avatar = avatar;
      }
    }

    if (isPrivate !== undefined) {
      if (!isOwner) {
        return sendError(res, 'Only owner can change group privacy', 'Forbidden', 403);
      }
      updateData.isPrivate = isPrivate === true || isPrivate === 'true';
    }

    await db.collection('groups').updateOne(
      { _id: new ObjectId(groupId) },
      { $set: updateData }
    );

    const updatedGroup = await db.collection('groups').findOne({ _id: new ObjectId(groupId) });

    return sendSuccess(res, {
      ...updatedGroup,
      _id: updatedGroup._id.toString()
    }, 'Group updated successfully');
  } catch (error) {
    console.error('Update group error:', error);
    return sendError(res, error, 'Failed to update group', 500);
  }
});

router.delete('/:groupId', verifyToken, updateGroupLimiter, async (req, res) => {
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

    if (group.owner !== req.userId) {
      return sendError(res, 'Only owner can delete group', 'Forbidden', 403);
    }

    await db.collection('groups').deleteOne({ _id: new ObjectId(groupId) });

    return sendSuccess(res, { groupId }, 'Group deleted successfully');
  } catch (error) {
    console.error('Delete group error:', error);
    return sendError(res, error, 'Failed to delete group', 500);
  }
});

export default router;

