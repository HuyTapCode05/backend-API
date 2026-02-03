import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const statisticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Get Group Statistics
router.get('/:groupId/statistics', verifyToken, statisticsLimiter, async (req, res) => {
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

    // Only members can view statistics
    if (group.isPrivate && !isMember) {
      return sendError(res, 'Access denied. This is a private group.', 'Forbidden', 403);
    }

    const groupIdStr = groupId;
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get total messages count
    const totalMessages = await db.collection('messages').countDocuments({ roomId: groupIdStr });

    // Get messages by type
    const messagesByType = await db.collection('messages').aggregate([
      { $match: { roomId: groupIdStr } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const typeStats = {
      text: 0,
      image: 0,
      video: 0,
      voice: 0,
      file: 0,
      sticker: 0,
      other: 0
    };

    messagesByType.forEach(item => {
      const type = item._id || 'text';
      if (typeStats.hasOwnProperty(type)) {
        typeStats[type] = item.count;
      } else {
        typeStats.other += item.count;
      }
    });

    // Get messages in time periods
    const messages24h = await db.collection('messages').countDocuments({
      roomId: groupIdStr,
      createdAt: { $gte: last24h.toISOString() }
    });

    const messages7days = await db.collection('messages').countDocuments({
      roomId: groupIdStr,
      createdAt: { $gte: last7days.toISOString() }
    });

    const messages30days = await db.collection('messages').countDocuments({
      roomId: groupIdStr,
      createdAt: { $gte: last30days.toISOString() }
    });

    // Get top contributors (users who sent most messages)
    const topContributors = await db.collection('messages').aggregate([
      { $match: { roomId: groupIdStr } },
      {
        $group: {
          _id: '$userId',
          messageCount: { $sum: 1 }
        }
      },
      { $sort: { messageCount: -1 } },
      { $limit: 10 }
    ]).toArray();

    // Get user info for top contributors
    const contributorUserIds = topContributors.map(c => new ObjectId(c._id));
    const contributors = await db.collection('users')
      .find({ _id: { $in: contributorUserIds } })
      .project({ password: 0, username: 1, avatar: 1 })
      .toArray();

    const contributorMap = {};
    contributors.forEach(user => {
      contributorMap[user._id.toString()] = {
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar || null
      };
    });

    const topContributorsWithInfo = topContributors.map(c => ({
      user: contributorMap[c._id] || { userId: c._id, username: 'Unknown', avatar: null },
      messageCount: c.messageCount
    }));

    // Get last activity (most recent message)
    const lastMessage = await db.collection('messages')
      .findOne(
        { roomId: groupIdStr },
        { sort: { createdAt: -1 }, projection: { createdAt: 1, userId: 1, type: 1 } }
      );

    // Get new members in time periods
    const newMembers7days = group.members.filter(m => {
      const joinedAt = new Date(m.joinedAt);
      return joinedAt >= last7days;
    }).length;

    const newMembers30days = group.members.filter(m => {
      const joinedAt = new Date(m.joinedAt);
      return joinedAt >= last30days;
    }).length;

    // Calculate average messages per day (last 30 days)
    const avgMessagesPerDay = messages30days > 0 ? (messages30days / 30).toFixed(2) : 0;

    // Get most active day (by message count per day in last 30 days)
    // Since createdAt is ISO string, extract date part (YYYY-MM-DD)
    const dailyActivity = await db.collection('messages').aggregate([
      {
        $match: {
          roomId: groupIdStr,
          createdAt: { $gte: last30days.toISOString() }
        }
      },
      {
        $group: {
          _id: { $substr: ['$createdAt', 0, 10] }, // Extract YYYY-MM-DD from ISO string
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]).toArray();

    const mostActiveDay = dailyActivity.length > 0 ? {
      date: dailyActivity[0]._id,
      messageCount: dailyActivity[0].count
    } : null;

    const statistics = {
      groupId: groupIdStr,
      groupName: group.name,
      overview: {
        totalMessages,
        totalMembers: group.memberCount,
        createdAt: group.createdAt,
        lastActivity: lastMessage?.createdAt || null
      },
      messages: {
        total: totalMessages,
        byType: typeStats,
        timePeriods: {
          last24h: messages24h,
          last7days: messages7days,
          last30days: messages30days
        },
        averagePerDay: parseFloat(avgMessagesPerDay),
        mostActiveDay
      },
      members: {
        total: group.memberCount,
        admins: group.admins.length,
        newMembers7days,
        newMembers30days
      },
      topContributors: topContributorsWithInfo,
      permissions: {
        isMember,
        isAdmin,
        isOwner
      }
    };

    return sendSuccess(res, statistics, 'Group statistics retrieved successfully');
  } catch (error) {
    console.error('Get group statistics error:', error);
    return sendError(res, error, 'Failed to get group statistics', 500);
  }
});

export default router;

