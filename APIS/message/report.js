import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId, sanitizeString, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const reportLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many report requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

function normalizeReason(reason) {
  const r = sanitizeString(reason || '').toLowerCase();
  const allowed = new Set(['spam', 'abuse', 'harassment', 'hate', 'sexual', 'scam', 'violence', 'other']);
  return allowed.has(r) ? r : 'other';
}

router.post('/:messageId/report', verifyToken, reportLimiter, async (req, res) => {
  try {
    const { messageId } = req.params;
    const allowedFields = ['reason', 'description'];
    const body = whitelistObject(req.body, allowedFields);
    const reason = normalizeReason(body.reason);
    const description = body.description ? sanitizeString(body.description).slice(0, 500) : null;

    if (!isValidObjectId(messageId)) {
      return sendError(res, 'Invalid message ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const msg = await db.collection('messages').findOne({ _id: new ObjectId(messageId) });
    if (!msg) {
      return sendError(res, 'Message not found', 'Not found', 404);
    }

    // If message belongs to a group -> reporter must be a member
    let group = null;
    if (msg.roomId && isValidObjectId(msg.roomId)) {
      group = await db.collection('groups').findOne({ _id: new ObjectId(msg.roomId) });
      if (group) {
        const isMember = group.members?.some(m => m.userId === req.userId);
        if (!isMember) {
          return sendError(res, 'You are not a member of this group', 'Forbidden', 403);
        }
      }
    }

    if (msg.userId === req.userId) {
      return sendError(res, 'Cannot report your own message', 'Validation error', 400);
    }

    const existing = await db.collection('message_reports').findOne({
      messageId,
      reportedBy: req.userId,
      status: 'open',
    });
    if (existing) {
      return sendSuccess(res, { reportId: existing._id.toString(), status: existing.status }, 'Report already submitted');
    }

    const report = {
      _id: new ObjectId(),
      messageId,
      roomId: msg.roomId || null,
      groupId: group ? group._id.toString() : null,
      reportedBy: req.userId,
      reportedUserId: msg.userId,
      reason,
      description,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
      // snapshot to help moderation even if message is edited/deleted later
      messageSnapshot: {
        userId: msg.userId,
        username: msg.username,
        userAvatar: msg.userAvatar || null,
        roomId: msg.roomId,
        text: msg.text || '',
        fileUrl: msg.fileUrl || null,
        fileType: msg.fileType || null,
        messageType: msg.messageType || 'text',
        createdAt: msg.createdAt,
      },
    };

    await db.collection('message_reports').insertOne(report);

    return sendSuccess(
      res,
      { reportId: report._id.toString(), status: report.status, messageId },
      'Report submitted successfully'
    );
  } catch (error) {
    console.error('Report message error:', error);
    return sendError(res, error, 'Failed to report message', 500);
  }
});

export default router;


