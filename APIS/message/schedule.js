import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, isValidObjectId, validateText, sanitizeString, whitelistObject } from '../utils/validation.js';
import { assertRoomUnlocked } from '../utils/groupLock.js';
import { assertPinVerified, isRoomHiddenForUser } from '../utils/userPin.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const scheduleLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many scheduling requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/schedule', verifyToken, scheduleLimiter, async (req, res) => {
  try {
    const allowedFields = ['roomId', 'text', 'fileUrl', 'fileType', 'messageType', 'source', 'replyToMessageId', 'scheduledAt'];
    const body = whitelistObject(req.body, allowedFields);
    let { roomId, text, fileUrl, fileType, messageType, source, replyToMessageId, scheduledAt } = body;

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

    if (!scheduledAt) {
      return sendError(res, 'scheduledAt is required', 'Validation error', 400);
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return sendError(res, 'Invalid scheduledAt date format. Use ISO 8601 format.', 'Validation error', 400);
    }

    const now = new Date();
    if (scheduledDate <= now) {
      return sendError(res, 'scheduledAt must be in the future', 'Validation error', 400);
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

    const scheduledMessage = {
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
      scheduledAt: scheduledDate.toISOString(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.collection('scheduled_messages').insertOne(scheduledMessage);

    return sendSuccess(res, scheduledMessage, 'Message scheduled successfully');
  } catch (error) {
    console.error('Schedule message error:', error);
    return sendError(res, error, 'Failed to schedule message', 500);
  }
});

router.get('/scheduled', verifyToken, async (req, res) => {
  try {
    const { roomId, status, limit = 50, skip = 0 } = req.query;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const query = { userId: req.userId };

    if (roomId) {
      const sanitizedRoomId = sanitizeString(roomId);
      if (isValidRoomId(sanitizedRoomId)) {
        query.roomId = sanitizedRoomId;
      }
    }

    if (status) {
      const validStatuses = ['pending', 'sent', 'cancelled', 'failed'];
      if (validStatuses.includes(sanitizeString(status))) {
        query.status = sanitizeString(status);
      }
    }

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skipNum = Math.max(parseInt(skip) || 0, 0);

    const scheduledMessages = await db.collection('scheduled_messages')
      .find(query)
      .sort({ scheduledAt: 1 })
      .limit(limitNum)
      .skip(skipNum)
      .toArray();

    const totalCount = await db.collection('scheduled_messages').countDocuments(query);

    return sendSuccess(res, {
      scheduledMessages,
      total: totalCount,
      returned: scheduledMessages.length,
      hasMore: (skipNum + limitNum) < totalCount
    }, 'Scheduled messages retrieved successfully');
  } catch (error) {
    console.error('Get scheduled messages error:', error);
    return sendError(res, error, 'Failed to get scheduled messages', 500);
  }
});

router.get('/scheduled/:scheduledId', verifyToken, async (req, res) => {
  try {
    const { scheduledId } = req.params;

    if (!isValidObjectId(scheduledId)) {
      return sendError(res, 'Invalid scheduled message ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const scheduledMessage = await db.collection('scheduled_messages').findOne({
      _id: new ObjectId(scheduledId),
      userId: req.userId
    });

    if (!scheduledMessage) {
      return sendError(res, 'Scheduled message not found', 'Not found', 404);
    }

    return sendSuccess(res, scheduledMessage, 'Scheduled message retrieved successfully');
  } catch (error) {
    console.error('Get scheduled message error:', error);
    return sendError(res, error, 'Failed to get scheduled message', 500);
  }
});

router.put('/scheduled/:scheduledId', verifyToken, scheduleLimiter, async (req, res) => {
  try {
    const { scheduledId } = req.params;
    const allowedFields = ['text', 'fileUrl', 'fileType', 'messageType', 'scheduledAt'];
    const body = whitelistObject(req.body, allowedFields);
    let { text, fileUrl, fileType, messageType, scheduledAt } = body;

    if (!isValidObjectId(scheduledId)) {
      return sendError(res, 'Invalid scheduled message ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const scheduledMessage = await db.collection('scheduled_messages').findOne({
      _id: new ObjectId(scheduledId),
      userId: req.userId
    });

    if (!scheduledMessage) {
      return sendError(res, 'Scheduled message not found', 'Not found', 404);
    }

    if (scheduledMessage.status !== 'pending') {
      return sendError(res, 'Only pending scheduled messages can be updated', 'Validation error', 400);
    }

    const updateData = { updatedAt: new Date().toISOString() };

    if (text !== undefined) {
      try {
        updateData.text = validateText(text, 10000);
      } catch (error) {
        return sendError(res, error.message, 'Validation error', 400);
      }
    }

    if (fileUrl !== undefined) {
      updateData.fileUrl = sanitizeString(fileUrl);
      if (fileUrl && !fileUrl.startsWith('/') && !fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
        return sendError(res, 'Invalid file URL format', 'Validation error', 400);
      }
    }

    if (fileType !== undefined) {
      updateData.fileType = sanitizeString(fileType);
    }

    if (messageType !== undefined) {
      updateData.messageType = sanitizeString(messageType);
    }

    if (scheduledAt !== undefined) {
      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return sendError(res, 'Invalid scheduledAt date format. Use ISO 8601 format.', 'Validation error', 400);
      }

      const now = new Date();
      if (scheduledDate <= now) {
        return sendError(res, 'scheduledAt must be in the future', 'Validation error', 400);
      }

      updateData.scheduledAt = scheduledDate.toISOString();
    }

    if (!updateData.text && !updateData.fileUrl && scheduledMessage.text && scheduledMessage.fileUrl) {
      return sendError(res, 'At least text or fileUrl must be provided', 'Validation error', 400);
    }

    await db.collection('scheduled_messages').updateOne(
      { _id: new ObjectId(scheduledId) },
      { $set: updateData }
    );

    const updated = await db.collection('scheduled_messages').findOne({
      _id: new ObjectId(scheduledId)
    });

    return sendSuccess(res, updated, 'Scheduled message updated successfully');
  } catch (error) {
    console.error('Update scheduled message error:', error);
    return sendError(res, error, 'Failed to update scheduled message', 500);
  }
});

router.delete('/scheduled/:scheduledId', verifyToken, async (req, res) => {
  try {
    const { scheduledId } = req.params;

    if (!isValidObjectId(scheduledId)) {
      return sendError(res, 'Invalid scheduled message ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const scheduledMessage = await db.collection('scheduled_messages').findOne({
      _id: new ObjectId(scheduledId),
      userId: req.userId
    });

    if (!scheduledMessage) {
      return sendError(res, 'Scheduled message not found', 'Not found', 404);
    }

    await db.collection('scheduled_messages').deleteOne({
      _id: new ObjectId(scheduledId)
    });

    return sendSuccess(res, { deleted: true }, 'Scheduled message deleted successfully');
  } catch (error) {
    console.error('Delete scheduled message error:', error);
    return sendError(res, error, 'Failed to delete scheduled message', 500);
  }
});

router.post('/scheduled/:scheduledId/cancel', verifyToken, async (req, res) => {
  try {
    const { scheduledId } = req.params;

    if (!isValidObjectId(scheduledId)) {
      return sendError(res, 'Invalid scheduled message ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const scheduledMessage = await db.collection('scheduled_messages').findOne({
      _id: new ObjectId(scheduledId),
      userId: req.userId
    });

    if (!scheduledMessage) {
      return sendError(res, 'Scheduled message not found', 'Not found', 404);
    }

    if (scheduledMessage.status !== 'pending') {
      return sendError(res, 'Only pending scheduled messages can be cancelled', 'Validation error', 400);
    }

    await db.collection('scheduled_messages').updateOne(
      { _id: new ObjectId(scheduledId) },
      { 
        $set: { 
          status: 'cancelled',
          updatedAt: new Date().toISOString()
        } 
      }
    );

    const updated = await db.collection('scheduled_messages').findOne({
      _id: new ObjectId(scheduledId)
    });

    return sendSuccess(res, updated, 'Scheduled message cancelled successfully');
  } catch (error) {
    console.error('Cancel scheduled message error:', error);
    return sendError(res, error, 'Failed to cancel scheduled message', 500);
  }
});

router.post('/scheduled/process', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const now = new Date();
    const pendingMessages = await db.collection('scheduled_messages')
      .find({
        status: 'pending',
        scheduledAt: { $lte: now.toISOString() }
      })
      .limit(100)
      .toArray();

    if (pendingMessages.length === 0) {
      return sendSuccess(res, { processed: 0, messages: [] }, 'No scheduled messages to process');
    }

    const processed = [];
    const failed = [];

    for (const scheduled of pendingMessages) {
      try {
        const unlockCheck = await assertRoomUnlocked(db, scheduled.roomId, scheduled.userId);
        if (!unlockCheck.ok) {
          await db.collection('scheduled_messages').updateOne(
            { _id: scheduled._id },
            { 
              $set: { 
                status: 'failed',
                error: unlockCheck.error,
                updatedAt: new Date().toISOString()
              } 
            }
          );
          failed.push({ id: scheduled._id.toString(), error: unlockCheck.error });
          continue;
        }

        const hidden = await isRoomHiddenForUser(scheduled.userId, scheduled.roomId);
        if (hidden) {
          await db.collection('scheduled_messages').updateOne(
            { _id: scheduled._id },
            { 
              $set: { 
                status: 'failed',
                error: 'Room is hidden and requires PIN verification',
                updatedAt: new Date().toISOString()
              } 
            }
          );
          failed.push({ id: scheduled._id.toString(), error: 'Room is hidden and requires PIN verification' });
          continue;
        }

        const user = await db.collection('users').findOne(
          { _id: new ObjectId(scheduled.userId) },
          { projection: { password: 0 } }
        );

        if (!user) {
          await db.collection('scheduled_messages').updateOne(
            { _id: scheduled._id },
            { 
              $set: { 
                status: 'failed',
                error: 'User not found',
                updatedAt: new Date().toISOString()
              } 
            }
          );
          failed.push({ id: scheduled._id.toString(), error: 'User not found' });
          continue;
        }

        const message = {
          _id: new ObjectId(),
          userId: scheduled.userId,
          username: scheduled.username,
          userAvatar: scheduled.userAvatar || null,
          roomId: scheduled.roomId,
          text: scheduled.text || '',
          fileUrl: scheduled.fileUrl || null,
          fileType: scheduled.fileType || null,
          messageType: scheduled.messageType || (scheduled.fileUrl ? 'file' : 'text'),
          source: scheduled.source || 'web',
          replyToMessageId: scheduled.replyToMessageId || null,
          replyToMessage: scheduled.replyToMessage || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          user: {
            userId: scheduled.userId,
            username: scheduled.username,
            avatar: scheduled.userAvatar || null,
            email: user.email || null
          }
        };

        await db.collection('messages').insertOne(message);

        await db.collection('scheduled_messages').updateOne(
          { _id: scheduled._id },
          { 
            $set: { 
              status: 'sent',
              sentAt: new Date().toISOString(),
              messageId: message._id.toString(),
              updatedAt: new Date().toISOString()
            } 
          }
        );

        processed.push({
          scheduledId: scheduled._id.toString(),
          messageId: message._id.toString(),
          roomId: scheduled.roomId
        });
      } catch (error) {
        console.error(`Error processing scheduled message ${scheduled._id}:`, error);
        await db.collection('scheduled_messages').updateOne(
          { _id: scheduled._id },
          { 
            $set: { 
              status: 'failed',
              error: error.message || 'Unknown error',
              updatedAt: new Date().toISOString()
            } 
          }
        );
        failed.push({ id: scheduled._id.toString(), error: error.message || 'Unknown error' });
      }
    }

    return sendSuccess(res, {
      processed: processed.length,
      failed: failed.length,
      total: pendingMessages.length,
      messages: processed,
      errors: failed
    }, 'Scheduled messages processed successfully');
  } catch (error) {
    console.error('Process scheduled messages error:', error);
    return sendError(res, error, 'Failed to process scheduled messages', 500);
  }
});

export default router;

