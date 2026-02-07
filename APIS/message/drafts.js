import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, isValidObjectId, validateText, sanitizeString, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const draftsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 50,
  message: 'Too many draft requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Save or update draft for a room
router.post('/draft', verifyToken, draftsLimiter, async (req, res) => {
  try {
    const allowedFields = ['roomId', 'text', 'fileUrl', 'fileType', 'messageType', 'replyToMessageId'];
    const body = whitelistObject(req.body, allowedFields);
    let { roomId, text, fileUrl, fileType, messageType, replyToMessageId } = body;

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

    if (fileType) {
      fileType = sanitizeString(fileType);
      const validTypes = ['image', 'video', 'audio', 'file', 'sticker'];
      if (!validTypes.includes(fileType)) {
        return sendError(res, 'Invalid fileType', 'Validation error', 400);
      }
    }

    if (messageType) {
      messageType = sanitizeString(messageType);
      const validTypes = ['text', 'image', 'video', 'audio', 'file', 'sticker', 'voice'];
      if (!validTypes.includes(messageType)) {
        return sendError(res, 'Invalid messageType', 'Validation error', 400);
      }
    }

    if (replyToMessageId && !isValidObjectId(replyToMessageId)) {
      return sendError(res, 'Invalid replyToMessageId format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    // Check if room exists (group or direct)
    const group = await db.collection('groups').findOne({ _id: roomId });
    if (!group) {
      // Check if it's a direct message room (format: userId1_userId2 or userId2_userId1)
      const parts = roomId.split('_');
      if (parts.length !== 2 || !isValidObjectId(parts[0]) || !isValidObjectId(parts[1])) {
        return sendError(res, 'Room not found', 'Not found', 404);
      }
      // Verify user is part of this direct room
      if (parts[0] !== req.userId && parts[1] !== req.userId) {
        return sendError(res, 'Room not found', 'Not found', 404);
      }
    } else {
      // Verify user is member of group
      const member = await db.collection('group_members').findOne({
        groupId: roomId,
        userId: req.userId
      });
      if (!member) {
        return sendError(res, 'You are not a member of this group', 'Forbidden', 403);
      }
    }

    const now = new Date().toISOString();
    const draftData = {
      userId: req.userId,
      roomId: roomId,
      text: text || null,
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      messageType: messageType || (fileUrl ? 'file' : 'text'),
      replyToMessageId: replyToMessageId || null,
      updatedAt: now,
      createdAt: now
    };

    // Upsert draft (one draft per user per room)
    const result = await db.collection('message_drafts').findOneAndUpdate(
      { userId: req.userId, roomId: roomId },
      { $set: draftData },
      { upsert: true, returnDocument: 'after' }
    );

    return sendSuccess(res, {
      draft: {
        _id: result.value?._id || result._id,
        ...draftData
      }
    }, 'Draft saved successfully');

  } catch (error) {
    console.error('Save draft error:', error);
    return sendError(res, error, 'Failed to save draft', 500);
  }
});

// Get all drafts for user
router.get('/drafts', verifyToken, draftsLimiter, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const drafts = await db.collection('message_drafts')
      .find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await db.collection('message_drafts').countDocuments({ userId: req.userId });

    return sendSuccess(res, {
      drafts: drafts,
      total: total,
      limit: limit,
      skip: skip
    }, 'Drafts retrieved successfully');

  } catch (error) {
    console.error('Get drafts error:', error);
    return sendError(res, error, 'Failed to get drafts', 500);
  }
});

// Get draft for specific room
router.get('/draft/:roomId', verifyToken, draftsLimiter, async (req, res) => {
  try {
    let { roomId } = req.params;
    roomId = sanitizeString(roomId);
    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const draft = await db.collection('message_drafts').findOne({
      userId: req.userId,
      roomId: roomId
    });

    if (!draft) {
      return sendSuccess(res, { draft: null }, 'No draft found for this room');
    }

    return sendSuccess(res, { draft: draft }, 'Draft retrieved successfully');

  } catch (error) {
    console.error('Get draft error:', error);
    return sendError(res, error, 'Failed to get draft', 500);
  }
});

// Update draft
router.put('/draft/:draftId', verifyToken, draftsLimiter, async (req, res) => {
  try {
    const { draftId } = req.params;
    if (!isValidObjectId(draftId)) {
      return sendError(res, 'Invalid draft ID format', 'Validation error', 400);
    }

    const allowedFields = ['text', 'fileUrl', 'fileType', 'messageType', 'replyToMessageId'];
    const body = whitelistObject(req.body, allowedFields);
    let { text, fileUrl, fileType, messageType, replyToMessageId } = body;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const draft = await db.collection('message_drafts').findOne({
      _id: new ObjectId(draftId),
      userId: req.userId
    });

    if (!draft) {
      return sendError(res, 'Draft not found', 'Not found', 404);
    }

    const updateData = { updatedAt: new Date().toISOString() };

    if (text !== undefined) {
      if (text === null || text === '') {
        updateData.text = null;
      } else {
        try {
          updateData.text = validateText(text, 10000);
        } catch (error) {
          return sendError(res, error.message, 'Validation error', 400);
        }
      }
    }

    if (fileUrl !== undefined) {
      if (fileUrl === null || fileUrl === '') {
        updateData.fileUrl = null;
      } else {
        fileUrl = sanitizeString(fileUrl);
        if (!fileUrl.startsWith('/') && !fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
          return sendError(res, 'Invalid file URL format', 'Validation error', 400);
        }
        updateData.fileUrl = fileUrl;
      }
    }

    if (fileType !== undefined) {
      if (fileType === null || fileType === '') {
        updateData.fileType = null;
      } else {
        fileType = sanitizeString(fileType);
        const validTypes = ['image', 'video', 'audio', 'file', 'sticker'];
        if (!validTypes.includes(fileType)) {
          return sendError(res, 'Invalid fileType', 'Validation error', 400);
        }
        updateData.fileType = fileType;
      }
    }

    if (messageType !== undefined) {
      if (messageType === null || messageType === '') {
        updateData.messageType = null;
      } else {
        messageType = sanitizeString(messageType);
        const validTypes = ['text', 'image', 'video', 'audio', 'file', 'sticker', 'voice'];
        if (!validTypes.includes(messageType)) {
          return sendError(res, 'Invalid messageType', 'Validation error', 400);
        }
        updateData.messageType = messageType;
      }
    }

    if (replyToMessageId !== undefined) {
      if (replyToMessageId === null || replyToMessageId === '') {
        updateData.replyToMessageId = null;
      } else if (!isValidObjectId(replyToMessageId)) {
        return sendError(res, 'Invalid replyToMessageId format', 'Validation error', 400);
      } else {
        updateData.replyToMessageId = replyToMessageId;
      }
    }

    // Ensure at least text or fileUrl exists
    const finalText = updateData.text !== undefined ? updateData.text : draft.text;
    const finalFileUrl = updateData.fileUrl !== undefined ? updateData.fileUrl : draft.fileUrl;
    if (!finalText && !finalFileUrl) {
      return sendError(res, 'Draft must have text or fileUrl', 'Validation error', 400);
    }

    await db.collection('message_drafts').updateOne(
      { _id: new ObjectId(draftId), userId: req.userId },
      { $set: updateData }
    );

    const updatedDraft = await db.collection('message_drafts').findOne({
      _id: new ObjectId(draftId)
    });

    return sendSuccess(res, { draft: updatedDraft }, 'Draft updated successfully');

  } catch (error) {
    console.error('Update draft error:', error);
    return sendError(res, error, 'Failed to update draft', 500);
  }
});

// Delete draft
router.delete('/draft/:draftId', verifyToken, draftsLimiter, async (req, res) => {
  try {
    const { draftId } = req.params;
    if (!isValidObjectId(draftId)) {
      return sendError(res, 'Invalid draft ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const result = await db.collection('message_drafts').deleteOne({
      _id: new ObjectId(draftId),
      userId: req.userId
    });

    if (result.deletedCount === 0) {
      return sendError(res, 'Draft not found', 'Not found', 404);
    }

    return sendSuccess(res, { deleted: true }, 'Draft deleted successfully');

  } catch (error) {
    console.error('Delete draft error:', error);
    return sendError(res, error, 'Failed to delete draft', 500);
  }
});

// Delete draft by roomId
router.delete('/draft/room/:roomId', verifyToken, draftsLimiter, async (req, res) => {
  try {
    let { roomId } = req.params;
    roomId = sanitizeString(roomId);
    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const result = await db.collection('message_drafts').deleteOne({
      userId: req.userId,
      roomId: roomId
    });

    if (result.deletedCount === 0) {
      return sendError(res, 'Draft not found for this room', 'Not found', 404);
    }

    return sendSuccess(res, { deleted: true }, 'Draft deleted successfully');

  } catch (error) {
    console.error('Delete draft by room error:', error);
    return sendError(res, error, 'Failed to delete draft', 500);
  }
});

// Send draft as message (creates message and deletes draft)
router.post('/draft/:draftId/send', verifyToken, draftsLimiter, async (req, res) => {
  try {
    const { draftId } = req.params;
    if (!isValidObjectId(draftId)) {
      return sendError(res, 'Invalid draft ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const draft = await db.collection('message_drafts').findOne({
      _id: new ObjectId(draftId),
      userId: req.userId
    });

    if (!draft) {
      return sendError(res, 'Draft not found', 'Not found', 404);
    }

    if (!draft.text && !draft.fileUrl) {
      return sendError(res, 'Draft is empty', 'Validation error', 400);
    }

    // Import send message logic (simplified version)
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    // Check room exists and user has access
    const group = await db.collection('groups').findOne({ _id: draft.roomId });
    if (!group) {
      const parts = draft.roomId.split('_');
      if (parts.length !== 2 || !isValidObjectId(parts[0]) || !isValidObjectId(parts[1])) {
        return sendError(res, 'Room not found', 'Not found', 404);
      }
      if (parts[0] !== req.userId && parts[1] !== req.userId) {
        return sendError(res, 'Room not found', 'Not found', 404);
      }
    } else {
      const member = await db.collection('group_members').findOne({
        groupId: draft.roomId,
        userId: req.userId
      });
      if (!member) {
        return sendError(res, 'You are not a member of this group', 'Forbidden', 403);
      }
    }

    const now = new Date().toISOString();
    const messageData = {
      roomId: draft.roomId,
      userId: req.userId,
      username: user.username,
      text: draft.text || null,
      fileUrl: draft.fileUrl || null,
      fileType: draft.fileType || null,
      messageType: draft.messageType || (draft.fileUrl ? 'file' : 'text'),
      replyToMessageId: draft.replyToMessageId || null,
      createdAt: now,
      updatedAt: now
    };

    const messageResult = await db.collection('messages').insertOne(messageData);
    const message = await db.collection('messages').findOne({ _id: messageResult.insertedId });

    // Delete draft after sending
    await db.collection('message_drafts').deleteOne({
      _id: new ObjectId(draftId),
      userId: req.userId
    });

    // Emit WebSocket event (if needed)
    // This would typically be handled by the WebSocket server

    return sendSuccess(res, {
      message: message,
      draftDeleted: true
    }, 'Message sent from draft successfully');

  } catch (error) {
    console.error('Send draft error:', error);
    return sendError(res, error, 'Failed to send draft', 500);
  }
});

export default router;

