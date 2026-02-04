import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const archiveLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/room/:roomId/archive', verifyToken, archiveLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const archiveRecord = await db.collection('archived_rooms').findOne({
      userId: req.userId,
      roomId: roomId
    });

    if (archiveRecord && archiveRecord.isArchived) {
      return sendError(res, 'Room is already archived', 'Validation error', 400);
    }

    if (archiveRecord) {
      await db.collection('archived_rooms').updateOne(
        { userId: req.userId, roomId: roomId },
        {
          $set: {
            isArchived: true,
            archivedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      );
    } else {
      await db.collection('archived_rooms').insertOne({
        userId: req.userId,
        roomId: roomId,
        isArchived: true,
        archivedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return sendSuccess(res, {
      roomId: roomId,
      isArchived: true,
      archivedAt: new Date().toISOString()
    }, 'Room archived successfully');
  } catch (error) {
    console.error('Archive room error:', error);
    return sendError(res, error, 'Failed to archive room', 500);
  }
});

router.post('/room/:roomId/unarchive', verifyToken, archiveLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const archiveRecord = await db.collection('archived_rooms').findOne({
      userId: req.userId,
      roomId: roomId
    });

    if (!archiveRecord || !archiveRecord.isArchived) {
      return sendError(res, 'Room is not archived', 'Validation error', 400);
    }

    await db.collection('archived_rooms').updateOne(
      { userId: req.userId, roomId: roomId },
      {
        $set: {
          isArchived: false,
          unarchivedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, {
      roomId: roomId,
      isArchived: false,
      unarchivedAt: new Date().toISOString()
    }, 'Room unarchived successfully');
  } catch (error) {
    console.error('Unarchive room error:', error);
    return sendError(res, error, 'Failed to unarchive room', 500);
  }
});

router.get('/room/:roomId/archive-status', verifyToken, archiveLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const archiveRecord = await db.collection('archived_rooms').findOne({
      userId: req.userId,
      roomId: roomId
    });

    return sendSuccess(res, {
      roomId: roomId,
      isArchived: archiveRecord?.isArchived || false,
      archivedAt: archiveRecord?.archivedAt || null,
      unarchivedAt: archiveRecord?.unarchivedAt || null
    }, 'Archive status retrieved successfully');
  } catch (error) {
    console.error('Get archive status error:', error);
    return sendError(res, error, 'Failed to get archive status', 500);
  }
});

router.get('/archived', verifyToken, archiveLimiter, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const archivedRooms = await db.collection('archived_rooms')
      .find({
        userId: req.userId,
        isArchived: true
      })
      .sort({ archivedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .toArray();

    const roomIds = archivedRooms.map(ar => ar.roomId);
    
    const groups = await db.collection('groups')
      .find({ _id: { $in: roomIds.map(id => new ObjectId(id)) } })
      .project({ name: 1, avatar: 1, memberCount: 1, owner: 1 })
      .toArray();

    const result = archivedRooms.map(ar => {
      const group = groups.find(g => g._id.toString() === ar.roomId);
      return {
        roomId: ar.roomId,
        roomName: group?.name || 'Unknown',
        roomAvatar: group?.avatar || null,
        memberCount: group?.memberCount || 0,
        archivedAt: ar.archivedAt
      };
    });

    return sendSuccess(res, {
      archivedRooms: result,
      total: result.length
    }, 'Archived rooms retrieved successfully');
  } catch (error) {
    console.error('Get archived rooms error:', error);
    return sendError(res, error, 'Failed to get archived rooms', 500);
  }
});

export default router;

