import express from 'express';
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidRoomId, sanitizeString, whitelistObject } from '../utils/validation.js';
import { assertRoomUnlocked } from '../utils/groupLock.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const voiceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many voice messages, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

const voiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = join(__dirname, '../../Uploads/Voice');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop() || 'mp3';
    cb(null, `voice-${uniqueSuffix}.${ext}`);
  }
});

const voiceFileFilter = (req, file, cb) => {
  const allowedTypes = /mp3|wav|ogg|m4a|aac|wma|opus|webm/;
  const allowedMimeTypes = /^audio\//;

  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedMimeTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Invalid voice file. Allowed: mp3, wav, ogg, m4a, aac, wma, opus, webm'));
  }
};

const uploadVoice = multer({
  storage: voiceStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: voiceFileFilter
});

router.post('/upload', verifyToken, uploadVoice.single('voice'), voiceLimiter, async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'No voice file provided', 'Validation error', 400);
    }

    const fileUrl = `/Uploads/Voice/${req.file.filename}`;

    return sendSuccess(res, {
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      fileType: 'voice'
    }, 'Voice file uploaded successfully');
  } catch (error) {
    console.error('Voice upload error:', error);
    return sendError(res, error, 'Voice upload failed', 500);
  }
});

router.post('/send', verifyToken, voiceLimiter, async (req, res) => {
  try {
    const allowedFields = ['roomId', 'fileUrl', 'duration', 'source', 'replyToMessageId'];
    const body = whitelistObject(req.body, allowedFields);
    let { roomId, fileUrl, duration, source, replyToMessageId } = body;

    if (!roomId) {
      return sendError(res, 'RoomId is required', 'Validation error', 400);
    }
    roomId = sanitizeString(roomId);
    if (!isValidRoomId(roomId)) {
      return sendError(res, 'Invalid room ID format', 'Validation error', 400);
    }

    if (!fileUrl) {
      return sendError(res, 'Voice file URL is required', 'Validation error', 400);
    }
    fileUrl = sanitizeString(fileUrl);
    if (!fileUrl.startsWith('/') && !fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
      return sendError(res, 'Invalid file URL format', 'Validation error', 400);
    }

    if (!duration || isNaN(duration) || duration < 0 || duration > 300) {
      return sendError(res, 'Duration must be between 0 and 300 seconds', 'Validation error', 400);
    }
    duration = parseInt(duration);

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const unlockCheck = await assertRoomUnlocked(db, roomId, req.userId);
    if (!unlockCheck.ok) {
      return sendError(res, unlockCheck.error, 'Locked', unlockCheck.status);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password: 0, username: 1, avatar: 1 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const validSources = ['app', 'web', 'api'];
    const messageSource = source && validSources.includes(source.toLowerCase()) 
      ? source.toLowerCase() 
      : 'web';

    const message = {
      _id: new ObjectId(),
      userId: req.userId,
      username: user.username,
      userAvatar: user.avatar || null,
      roomId: roomId,
      text: '',
      fileUrl: fileUrl,
      fileType: 'voice',
      messageType: 'voice',
      duration: duration,
      source: messageSource,
      replyToMessageId: replyToMessageId && sanitizeString(replyToMessageId) || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (replyToMessageId) {
      const replyToMessage = await db.collection('messages').findOne({
        _id: new ObjectId(replyToMessageId),
        roomId: roomId
      });

      if (replyToMessage) {
        message.replyTo = {
          messageId: replyToMessageId,
          userId: replyToMessage.userId,
          username: replyToMessage.username,
          text: replyToMessage.text || '[Voice message]',
          messageType: replyToMessage.messageType
        };
      }
    }

    await db.collection('messages').insertOne(message);

    return sendSuccess(res, {
      ...message,
      _id: message._id.toString()
    }, 'Voice message sent successfully');
  } catch (error) {
    console.error('Send voice message error:', error);
    return sendError(res, error, 'Failed to send voice message', 500);
  }
});

export default router;

