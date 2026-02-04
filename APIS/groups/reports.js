import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId, sanitizeString, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const reportsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:groupId/reports', verifyToken, reportsLimiter, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { status = 'open', limit = 50, skip = 0 } = req.query;

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

    const isOwner = group.owner === req.userId;
    const isAdmin = group.admins.includes(req.userId);
    if (!isOwner && !isAdmin) {
      return sendError(res, 'Only owner or admin can view reports', 'Forbidden', 403);
    }

    const allowedStatus = new Set(['open', 'resolved', 'rejected', 'all']);
    const st = typeof status === 'string' ? sanitizeString(status).toLowerCase() : 'open';
    const q = { groupId };
    if (allowedStatus.has(st) && st !== 'all') {
      q.status = st;
    } else if (!allowedStatus.has(st)) {
      q.status = 'open';
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    const reports = await db.collection('message_reports')
      .find(q)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    return sendSuccess(res, { reports, total: reports.length }, 'Reports retrieved successfully');
  } catch (error) {
    console.error('Get group reports error:', error);
    return sendError(res, error, 'Failed to get reports', 500);
  }
});

router.post('/:groupId/reports/:reportId/resolve', verifyToken, reportsLimiter, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const allowedFields = ['status', 'resolutionNote'];
    const body = whitelistObject(req.body, allowedFields);

    if (!isValidObjectId(groupId)) {
      return sendError(res, 'Invalid group ID format', 'Validation error', 400);
    }
    if (!isValidObjectId(reportId)) {
      return sendError(res, 'Invalid report ID format', 'Validation error', 400);
    }

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
      return sendError(res, 'Only owner or admin can resolve reports', 'Forbidden', 403);
    }

    const report = await db.collection('message_reports').findOne({ _id: new ObjectId(reportId), groupId });
    if (!report) {
      return sendError(res, 'Report not found', 'Not found', 404);
    }

    const nextStatusRaw = typeof body.status === 'string' ? sanitizeString(body.status).toLowerCase() : 'resolved';
    const nextStatus = nextStatusRaw === 'rejected' ? 'rejected' : 'resolved';
    const resolutionNote = body.resolutionNote ? sanitizeString(body.resolutionNote).slice(0, 500) : null;

    const now = new Date().toISOString();
    await db.collection('message_reports').updateOne(
      { _id: new ObjectId(reportId) },
      {
        $set: {
          status: nextStatus,
          updatedAt: now,
          resolvedAt: now,
          resolvedBy: req.userId,
          resolution: resolutionNote,
        },
      }
    );

    return sendSuccess(
      res,
      { reportId, status: nextStatus, resolvedAt: now, resolvedBy: req.userId },
      'Report resolved successfully'
    );
  } catch (error) {
    console.error('Resolve report error:', error);
    return sendError(res, error, 'Failed to resolve report', 500);
  }
});

export default router;