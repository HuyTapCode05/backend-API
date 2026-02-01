import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { verifyToken } from '../../Auth/middleware.js';
import { isValidObjectId, sanitizeString, whitelistObject } from '../../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const reactionsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/:messageId/reaction', verifyToken, reactionsLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    const allowedFields = ['reaction'];
    const body = whitelistObject(req.body, allowedFields);
    let { reaction } = body;

    if (!isValidObjectId(messageId)) {
      return sendError(res, 'Invalid message ID format', 'Validation error', 400);
    }

    if (!reaction || typeof reaction !== 'string') {
      return sendError(res, 'Reaction is required', 'Validation error', 400);
    }

    reaction = sanitizeString(reaction.trim());
    if (reaction.length === 0 || reaction.length > 20) {
      return sendError(res, 'Reaction must be between 1 and 20 characters', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const message = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });

    if (!message) {
      return sendError(res, 'Message not found', 'Not found', 404);
    }

    const existingReaction = await db.collection('message_reactions').findOne({
      messageId: messageId,
      userId: req.userId
    });

    if (existingReaction) {
      await db.collection('message_reactions').updateOne(
        { messageId: messageId, userId: req.userId },
        { $set: { reaction: reaction, updatedAt: new Date().toISOString() } }
      );
    } else {
      await db.collection('message_reactions').insertOne({
        _id: new ObjectId(),
        messageId: messageId,
        userId: req.userId,
        reaction: reaction,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const reactions = await db.collection('message_reactions')
      .find({ messageId: messageId })
      .toArray();

    const reactionCounts = {};
    reactions.forEach(r => {
      if (!reactionCounts[r.reaction]) {
        reactionCounts[r.reaction] = { count: 0, users: [] };
      }
      reactionCounts[r.reaction].count++;
      reactionCounts[r.reaction].users.push(r.userId);
    });

    return sendSuccess(res, {
      messageId: messageId,
      reactions: reactionCounts,
      myReaction: reaction
    }, 'Reaction added successfully');
  } catch (error) {
    console.error('Add reaction error:', error);
    return sendError(res, error, 'Failed to add reaction', 500);
  }
});

export default router;

