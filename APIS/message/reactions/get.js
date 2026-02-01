import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { verifyToken } from '../../Auth/middleware.js';
import { isValidObjectId } from '../../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const reactionsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:messageId/reactions', verifyToken, reactionsLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!isValidObjectId(messageId)) {
      return sendError(res, 'Invalid message ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
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

    const myReaction = reactions.find(r => r.userId === req.userId);

    return sendSuccess(res, {
      messageId: messageId,
      reactions: reactionCounts,
      myReaction: myReaction ? myReaction.reaction : null
    }, 'Reactions retrieved successfully');
  } catch (error) {
    console.error('Get reactions error:', error);
    return sendError(res, error, 'Failed to get reactions', 500);
  }
});

export default router;

