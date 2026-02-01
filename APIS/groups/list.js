import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const listGroupsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', verifyToken, listGroupsLimiter, async (req, res) => {
  try {
    const { type = 'all', limit = 50, skip = 0, search } = req.query;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    let query = {};

    if (type === 'my') {
      query['members.userId'] = req.userId;
    } else if (type === 'public') {
      query.isPrivate = false;
    } else if (type === 'owned') {
      query.owner = req.userId;
    }

    if (search) {
      const searchTerm = sanitizeString(search.trim());
      if (searchTerm.length > 0) {
        query.$or = [
          { name: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } }
        ];
      }
    }

    const groups = await db.collection('groups')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const enrichedGroups = groups.map(group => {
      const isMember = group.members.some(m => m.userId === req.userId);
      const isAdmin = group.admins.includes(req.userId);
      const isOwner = group.owner === req.userId;

      return {
        _id: group._id.toString(),
        name: group.name,
        description: group.description,
        avatar: group.avatar,
        owner: group.owner,
        memberCount: group.memberCount,
        isPrivate: group.isPrivate,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        isMember,
        isAdmin,
        isOwner,
        myRole: isOwner ? 'owner' : isAdmin ? 'admin' : isMember ? 'member' : null
      };
    });

    const totalCount = await db.collection('groups').countDocuments(query);

    return sendSuccess(res, {
      groups: enrichedGroups,
      total: totalCount,
      returned: enrichedGroups.length,
      hasMore: (skipNum + limitNum) < totalCount,
      type
    }, 'Groups retrieved successfully');
  } catch (error) {
    console.error('List groups error:', error);
    return sendError(res, error, 'Failed to list groups', 500);
  }
});

export default router;

