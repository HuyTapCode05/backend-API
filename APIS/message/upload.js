import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileType = req.body.fileType || 'chat';
    let uploadPath;

    switch (fileType) {
      case 'avatar':
        uploadPath = join(__dirname, '../../Uploads/Images/Avatar');
        break;
      case 'sticker':
        uploadPath = join(__dirname, '../../Uploads/Images/sticker');
        break;
      case 'video':
        uploadPath = join(__dirname, '../../Uploads/Video');
        break;
      case 'voice':
        uploadPath = join(__dirname, '../../Uploads/Voice');
        break;
      case 'emg':
        uploadPath = join(__dirname, '../../Uploads/Images/emg');
        break;
      case 'chat':
      default:
        uploadPath = join(__dirname, '../../Uploads/Images/Chat');
        break;
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop();
    cb(null, `${req.body.fileType || 'chat'}-${uniqueSuffix}.${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const fileType = req.body.fileType || 'chat';
  const allowedTypes = {
    chat: /jpeg|jpg|png|gif|webp/,
    avatar: /jpeg|jpg|png|gif|webp/,
    sticker: /jpeg|jpg|png|gif|webp|webm/,
    emg: /jpeg|jpg|png|gif|webp/,
    video: /mp4|avi|mov|wmv|flv|webm|mkv/,
    voice: /mp3|wav|ogg|m4a|aac|wma/
  };

  const allowedMimeTypes = {
    chat: /^image\//,
    avatar: /^image\//,
    sticker: /^(image|video)\//,
    emg: /^image\//,
    video: /^video\//,
    voice: /^audio\//
  };

  const extname = allowedTypes[fileType]?.test(file.originalname.toLowerCase());
  const mimetype = allowedMimeTypes[fileType]?.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${fileType}. Allowed: ${allowedTypes[fileType]?.source}`));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: fileFilter
});
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file provided', 'Validation error', 400);
    }

    const fileType = req.body.fileType || 'chat';
    const fileUrl = `/${req.file.destination.replace(/\\/g, '/').split('Uploads/')[1]}/${req.file.filename}`;

    return sendSuccess(res, {
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      fileType: fileType
    }, 'File uploaded successfully');
  } catch (error) {
    console.error('Upload error:', error);
    return sendError(res, error, 'Upload failed', 500);
  }
});

export default router;

