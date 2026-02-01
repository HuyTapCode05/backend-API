import express from 'express';
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = join(__dirname, '../../Uploads/Images/Avatar');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop();
    cb(null, `avatar-${req.userId}-${uniqueSuffix}.${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = /^image\//.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for avatar!'));
    }
  }
});

router.post('/me/avatar', verifyToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'No avatar file provided', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const avatarUrl = `/Uploads/Images/Avatar/${req.file.filename}`;

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      {
        $set: {
          avatar: avatarUrl,
          updatedAt: new Date().toISOString()
        }
      }
    );

    return sendSuccess(res, {
      avatar: avatarUrl,
      url: avatarUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      fileType: 'avatar'
    }, 'Avatar uploaded successfully');
  } catch (error) {
    console.error('Upload avatar error:', error);
    return sendError(res, error, 'Failed to upload avatar', 500);
  }
});

export default router;

