import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, isValidObjectId, validateText, sanitizeString, whitelistObject } from '../utils/validation.js';
import { parseMentions, validateMentions } from '../utils/mentions.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many messages, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});
router.post('/send', verifyToken, messageLimiter, async (req, res) => {
  try {
    const allowedFields = ['roomId', 'text', 'fileUrl', 'fileType', 'messageType', 'source', 'replyToMessageId'];
    const body = whitelistObject(req.body, allowedFields);
    let { roomId, text, fileUrl, fileType, messageType, source, replyToMessageId } = body;

    if (!roomId) {
      return sendError(res, 'RoomId is required', 'Validation error', 400);
    }
    roomId = sanitizeString(roomId);
    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    if (!text && !fileUrl) {
      return sendError(res, 'Text or fileUrl is required', 'Validation error', 400);
    }

    if (text) {
      try {
        text = validateText(text, 10000);
      } catch (error) {
        return sendError(res, error.message, 'Validation error', 400);
      }
    }

    if (fileUrl) {
      fileUrl = sanitizeString(fileUrl);
      if (!fileUrl.startsWith('/') && !fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
        return sendError(res, 'Invalid file URL format', 'Validation error', 400);
      }
    }

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

    const validSources = ['app', 'web', 'api'];
    const messageSource = source && validSources.includes(source.toLowerCase()) 
      ? source.toLowerCase() 
      : 'web';

    let replyToMessage = null;
    if (replyToMessageId && isValidObjectId(replyToMessageId)) {
      replyToMessage = await db.collection('messages').findOne(
        { _id: new ObjectId(replyToMessageId), roomId: roomId },
        { projection: { userId: 1, username: 1, text: 1, messageType: 1, fileUrl: 1 } }
      );

      if (!replyToMessage) {
        return sendError(res, 'Reply message not found in this room', 'Validation error', 400);
      }
    }

    // Parse and validate mentions
    let mentions = [];
    if (text) {
      const mentionedUsernames = parseMentions(text);
      if (mentionedUsernames.length > 0) {
        // Check if roomId is a group
        const group = await db.collection('groups').findOne({ _id: roomId });
        const isGroup = !!group;
        
        mentions = await validateMentions(db, mentionedUsernames, roomId, isGroup);
        
        // Remove duplicates
        const seen = new Set();
        mentions = mentions.filter(m => {
          if (seen.has(m.userId)) return false;
          seen.add(m.userId);
          return true;
        });
      }
    }

    const message = {
      _id: new ObjectId(),
      userId: req.userId,
      username: user.username,
      userAvatar: user.avatar || null,
      roomId: roomId,
      text: text || '',
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      messageType: messageType || (fileUrl ? 'file' : 'text'),
      source: messageSource,
      replyToMessageId: replyToMessage ? replyToMessageId : null,
      replyToMessage: replyToMessage ? {
        messageId: replyToMessageId,
        userId: replyToMessage.userId,
        username: replyToMessage.username,
        text: replyToMessage.text,
        messageType: replyToMessage.messageType,
        fileUrl: replyToMessage.fileUrl
      } : null,
      mentions: mentions.length > 0 ? mentions : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        userId: req.userId,
        username: user.username,
        avatar: user.avatar || null,
        email: user.email || null
      }
    };

    await db.collection('messages').insertOne(message);

    if (mentions.length > 0) {
      const notificationPromises = mentions
        .filter(m => m.userId !== req.userId)
        .map(mention => {
          return db.collection('notifications').insertOne({
            _id: new ObjectId(),
            userId: mention.userId,
            type: 'mention',
            title: `You were mentioned by ${user.username}`,
            message: text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : 'You were mentioned in a message',
            data: {
              messageId: message._id.toString(),
              roomId: roomId,
              mentionedBy: {
                userId: req.userId,
                username: user.username,
                avatar: user.avatar
              }
            },
            read: false,
            createdAt: new Date().toISOString()
          });
        });
      
      await Promise.all(notificationPromises);
    }

    return sendSuccess(res, message, 'Message sent successfully');
  } catch (error) {
    console.error('Send message error:', error);
    return sendError(res, error, 'Failed to send message', 500);
  }
});

export default router;

