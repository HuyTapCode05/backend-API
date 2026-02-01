import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many search requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/search', verifyToken, searchLimiter, async (req, res) => {
  try {
    const { q, roomId, userId, limit = 50, skip = 0, sort = 'relevance' } = req.query;

    if (!q || q.trim().length === 0) {
      return sendError(res, 'Search query is required', 'Validation error', 400);
    }

    const searchQuery = sanitizeString(q.trim());
    if (searchQuery.length < 2) {
      return sendError(res, 'Search query must be at least 2 characters', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const query = { $text: { $search: searchQuery } };

    if (roomId) {
      const sanitizedRoomId = sanitizeString(roomId);
      if (isValidRoomId(sanitizedRoomId)) {
        query.roomId = sanitizedRoomId;
      }
    }

    if (userId) {
      try {
        query.userId = new ObjectId(userId).toString();
      } catch (e) {
        return sendError(res, 'Invalid user ID format', 'Validation error', 400);
      }
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    let sortOption = { score: { $meta: 'textScore' }, createdAt: -1 };
    if (sort === 'date') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'date_asc') {
      sortOption = { createdAt: 1 };
    }

    const messages = await db.collection('messages')
      .find(query, { score: { $meta: 'textScore' } })
      .sort(sortOption)
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const userIds = [...new Set(messages.map(m => m.userId))];
    const users = await db.collection('users')
      .find({ _id: { $in: userIds.map(id => new ObjectId(id)) } })
      .project({ password: 0 })
      .toArray();

    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar,
        email: user.email
      };
    });

    const enrichedMessages = messages.map(msg => ({
      ...msg,
      user: userMap[msg.userId] || {
        userId: msg.userId,
        username: msg.username,
        avatar: msg.userAvatar
      },
      score: msg.score || 0
    }));

    const totalCount = await db.collection('messages').countDocuments(query);

    return sendSuccess(res, {
      messages: enrichedMessages,
      total: totalCount,
      returned: enrichedMessages.length,
      hasMore: (skipNum + limitNum) < totalCount,
      query: searchQuery,
      filters: {
        roomId: roomId || null,
        userId: userId || null
      }
    }, 'Search completed successfully');
  } catch (error) {
    console.error('Search messages error:', error);
    
    if (error.message && error.message.includes('text index')) {
      return sendError(res, 'Full-text search index not available. Please contact administrator.', 'Search error', 503);
    }
    
    return sendError(res, error, 'Failed to search messages', 500);
  }
});

router.get('/search/advanced', verifyToken, searchLimiter, async (req, res) => {
  try {
    const { 
      q, 
      roomId, 
      userId, 
      messageType,
      fileType,
      source,
      dateFrom,
      dateTo,
      limit = 50, 
      skip = 0, 
      sort = 'relevance' 
    } = req.query;

    if (!q || q.trim().length === 0) {
      return sendError(res, 'Search query is required', 'Validation error', 400);
    }

    const searchQuery = sanitizeString(q.trim());
    if (searchQuery.length < 2) {
      return sendError(res, 'Search query must be at least 2 characters', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const query = { $text: { $search: searchQuery } };

    if (roomId) {
      const sanitizedRoomId = sanitizeString(roomId);
      if (isValidRoomId(sanitizedRoomId)) {
        query.roomId = sanitizedRoomId;
      }
    }

    if (userId) {
      try {
        query.userId = new ObjectId(userId).toString();
      } catch (e) {
        return sendError(res, 'Invalid user ID format', 'Validation error', 400);
      }
    }

    if (messageType) {
      const validTypes = ['text', 'file', 'image', 'video', 'voice', 'sticker'];
      if (validTypes.includes(sanitizeString(messageType))) {
        query.messageType = sanitizeString(messageType);
      }
    }

    if (fileType) {
      const validFileTypes = ['chat', 'avatar', 'sticker', 'video', 'voice', 'emg'];
      if (validFileTypes.includes(sanitizeString(fileType))) {
        query.fileType = sanitizeString(fileType);
      }
    }

    if (source) {
      const validSources = ['app', 'web', 'api'];
      if (validSources.includes(sanitizeString(source))) {
        query.source = sanitizeString(source);
      }
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        try {
          query.createdAt.$gte = new Date(dateFrom).toISOString();
        } catch (e) {
          return sendError(res, 'Invalid dateFrom format. Use ISO 8601 format.', 'Validation error', 400);
        }
      }
      if (dateTo) {
        try {
          query.createdAt.$lte = new Date(dateTo).toISOString();
        } catch (e) {
          return sendError(res, 'Invalid dateTo format. Use ISO 8601 format.', 'Validation error', 400);
        }
      }
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    let sortOption = { score: { $meta: 'textScore' }, createdAt: -1 };
    if (sort === 'date') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'date_asc') {
      sortOption = { createdAt: 1 };
    }

    const messages = await db.collection('messages')
      .find(query, { score: { $meta: 'textScore' } })
      .sort(sortOption)
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const userIds = [...new Set(messages.map(m => m.userId))];
    const users = await db.collection('users')
      .find({ _id: { $in: userIds.map(id => new ObjectId(id)) } })
      .project({ password: 0 })
      .toArray();

    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar,
        email: user.email
      };
    });

    const enrichedMessages = messages.map(msg => ({
      ...msg,
      user: userMap[msg.userId] || {
        userId: msg.userId,
        username: msg.username,
        avatar: msg.userAvatar
      },
      score: msg.score || 0
    }));

    const totalCount = await db.collection('messages').countDocuments(query);

    return sendSuccess(res, {
      messages: enrichedMessages,
      total: totalCount,
      returned: enrichedMessages.length,
      hasMore: (skipNum + limitNum) < totalCount,
      query: searchQuery,
      filters: {
        roomId: roomId || null,
        userId: userId || null,
        messageType: messageType || null,
        fileType: fileType || null,
        source: source || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null
      }
    }, 'Advanced search completed successfully');
  } catch (error) {
    console.error('Advanced search messages error:', error);
    
    if (error.message && error.message.includes('text index')) {
      return sendError(res, 'Full-text search index not available. Please contact administrator.', 'Search error', 503);
    }
    
    return sendError(res, error, 'Failed to search messages', 500);
  }
});

export default router;

