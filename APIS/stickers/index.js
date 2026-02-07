import express from 'express';
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId, sanitizeString, whitelistObject } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const stickerLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many sticker requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer config for sticker upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = join(__dirname, '../../Uploads/Images/sticker');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop();
    cb(null, `sticker-${uniqueSuffix}.${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExts = /jpeg|jpg|png|gif|webp|webm/;
  const allowedMimeTypes = /^(image|video)\//;
  
  const extname = allowedExts.test(file.originalname.toLowerCase());
  const mimetype = allowedMimeTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Invalid sticker file. Allowed: jpeg, jpg, png, gif, webp, webm'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: fileFilter
});

// Upload sticker
router.post('/upload', verifyToken, stickerLimiter, upload.single('sticker'), async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'Sticker file is required', 'Validation error', 400);
    }

    const allowedFields = ['name', 'category', 'pack', 'tags'];
    const body = whitelistObject(req.body, allowedFields);
    let { name, category, pack, tags } = body;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const fileUrl = `/Uploads/Images/sticker/${req.file.filename}`;
    const now = new Date().toISOString();

    const stickerData = {
      userId: req.userId,
      name: name ? sanitizeString(name) : `Sticker ${Date.now()}`,
      category: category ? sanitizeString(category) : 'custom',
      pack: pack ? sanitizeString(pack) : 'user',
      tags: tags ? tags.split(',').map(t => sanitizeString(t.trim())).filter(t => t) : [],
      fileUrl: fileUrl,
      fileType: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
      fileSize: req.file.size,
      width: null,
      height: null,
      isPublic: false, // User's own stickers are private by default
      usageCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const result = await db.collection('stickers').insertOne(stickerData);
    const sticker = await db.collection('stickers').findOne({ _id: result.insertedId });

    return sendSuccess(res, { sticker: sticker }, 'Sticker uploaded successfully');

  } catch (error) {
    console.error('Upload sticker error:', error);
    if (error.message && error.message.includes('Invalid sticker')) {
      return sendError(res, error.message, 'Validation error', 400);
    }
    return sendError(res, error, 'Failed to upload sticker', 500);
  }
});

// List stickers
router.get('/', verifyToken, stickerLimiter, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const category = req.query.category;
    const pack = req.query.pack;
    const type = req.query.type; // 'all', 'public', 'my', 'favorites'
    const search = req.query.search;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    let query = {};

    // Filter by type
    if (type === 'my') {
      query.userId = req.userId;
    } else if (type === 'favorites') {
      // Get user's favorite sticker IDs
      const favorites = await db.collection('sticker_favorites')
        .find({ userId: req.userId })
        .toArray();
      const favoriteIds = favorites.map(f => f.stickerId);
      if (favoriteIds.length === 0) {
        return sendSuccess(res, { stickers: [], total: 0, limit, skip }, 'No favorite stickers');
      }
      query._id = { $in: favoriteIds };
    } else if (type === 'public') {
      query.isPublic = true;
    } else {
      // 'all' - show public + user's own
      query.$or = [
        { isPublic: true },
        { userId: req.userId }
      ];
    }

    // Filter by category
    if (category) {
      query.category = sanitizeString(category);
    }

    // Filter by pack
    if (pack) {
      query.pack = sanitizeString(pack);
    }

    // Search by name or tags
    if (search) {
      const searchTerm = sanitizeString(search);
      query.$or = [
        ...(query.$or || []),
        { name: { $regex: searchTerm, $options: 'i' } },
        { tags: { $in: [new RegExp(searchTerm, 'i')] } }
      ];
    }

    const stickers = await db.collection('stickers')
      .find(query)
      .sort({ favoriteCount: -1, usageCount: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await db.collection('stickers').countDocuments(query);

    // Get user's favorite sticker IDs for this batch
    const stickerIds = stickers.map(s => s._id);
    const userFavorites = await db.collection('sticker_favorites')
      .find({ userId: req.userId, stickerId: { $in: stickerIds } })
      .toArray();
    const favoriteIds = new Set(userFavorites.map(f => f.stickerId.toString()));

    // Add isFavorite flag to each sticker
    const stickersWithFavorite = stickers.map(sticker => ({
      ...sticker,
      isFavorite: favoriteIds.has(sticker._id.toString())
    }));

    return sendSuccess(res, {
      stickers: stickersWithFavorite,
      total: total,
      limit: limit,
      skip: skip
    }, 'Stickers retrieved successfully');

  } catch (error) {
    console.error('List stickers error:', error);
    return sendError(res, error, 'Failed to list stickers', 500);
  }
});

// Get sticker by ID
router.get('/:stickerId', verifyToken, stickerLimiter, async (req, res) => {
  try {
    const { stickerId } = req.params;
    if (!isValidObjectId(stickerId)) {
      return sendError(res, 'Invalid sticker ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const sticker = await db.collection('stickers').findOne({ _id: new ObjectId(stickerId) });

    if (!sticker) {
      return sendError(res, 'Sticker not found', 'Not found', 404);
    }

    // Check access (public or user's own)
    if (!sticker.isPublic && sticker.userId !== req.userId) {
      return sendError(res, 'Sticker not found', 'Not found', 404);
    }

    // Check if user favorited this sticker
    const favorite = await db.collection('sticker_favorites').findOne({
      userId: req.userId,
      stickerId: new ObjectId(stickerId)
    });

    return sendSuccess(res, {
      sticker: {
        ...sticker,
        isFavorite: !!favorite
      }
    }, 'Sticker retrieved successfully');

  } catch (error) {
    console.error('Get sticker error:', error);
    return sendError(res, error, 'Failed to get sticker', 500);
  }
});

// Update sticker (only owner)
router.put('/:stickerId', verifyToken, stickerLimiter, async (req, res) => {
  try {
    const { stickerId } = req.params;
    if (!isValidObjectId(stickerId)) {
      return sendError(res, 'Invalid sticker ID format', 'Validation error', 400);
    }

    const allowedFields = ['name', 'category', 'pack', 'tags', 'isPublic'];
    const body = whitelistObject(req.body, allowedFields);
    let { name, category, pack, tags, isPublic } = body;

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const sticker = await db.collection('stickers').findOne({ _id: new ObjectId(stickerId) });

    if (!sticker) {
      return sendError(res, 'Sticker not found', 'Not found', 404);
    }

    if (sticker.userId !== req.userId) {
      return sendError(res, 'You can only update your own stickers', 'Forbidden', 403);
    }

    const updateData = { updatedAt: new Date().toISOString() };

    if (name !== undefined) {
      updateData.name = sanitizeString(name);
    }
    if (category !== undefined) {
      updateData.category = sanitizeString(category);
    }
    if (pack !== undefined) {
      updateData.pack = sanitizeString(pack);
    }
    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        updateData.tags = tags.map(t => sanitizeString(t)).filter(t => t);
      } else if (typeof tags === 'string') {
        updateData.tags = tags.split(',').map(t => sanitizeString(t.trim())).filter(t => t);
      }
    }
    if (isPublic !== undefined) {
      updateData.isPublic = Boolean(isPublic);
    }

    await db.collection('stickers').updateOne(
      { _id: new ObjectId(stickerId), userId: req.userId },
      { $set: updateData }
    );

    const updatedSticker = await db.collection('stickers').findOne({ _id: new ObjectId(stickerId) });

    return sendSuccess(res, { sticker: updatedSticker }, 'Sticker updated successfully');

  } catch (error) {
    console.error('Update sticker error:', error);
    return sendError(res, error, 'Failed to update sticker', 500);
  }
});

// Delete sticker (only owner)
router.delete('/:stickerId', verifyToken, stickerLimiter, async (req, res) => {
  try {
    const { stickerId } = req.params;
    if (!isValidObjectId(stickerId)) {
      return sendError(res, 'Invalid sticker ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const sticker = await db.collection('stickers').findOne({ _id: new ObjectId(stickerId) });

    if (!sticker) {
      return sendError(res, 'Sticker not found', 'Not found', 404);
    }

    if (sticker.userId !== req.userId) {
      return sendError(res, 'You can only delete your own stickers', 'Forbidden', 403);
    }

    // Delete all favorites for this sticker
    await db.collection('sticker_favorites').deleteMany({ stickerId: new ObjectId(stickerId) });

    // Delete sticker
    await db.collection('stickers').deleteOne({ _id: new ObjectId(stickerId), userId: req.userId });

    return sendSuccess(res, { deleted: true }, 'Sticker deleted successfully');

  } catch (error) {
    console.error('Delete sticker error:', error);
    return sendError(res, error, 'Failed to delete sticker', 500);
  }
});

// Favorite sticker
router.post('/:stickerId/favorite', verifyToken, stickerLimiter, async (req, res) => {
  try {
    const { stickerId } = req.params;
    if (!isValidObjectId(stickerId)) {
      return sendError(res, 'Invalid sticker ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const sticker = await db.collection('stickers').findOne({ _id: new ObjectId(stickerId) });

    if (!sticker) {
      return sendError(res, 'Sticker not found', 'Not found', 404);
    }

    // Check if already favorited
    const existing = await db.collection('sticker_favorites').findOne({
      userId: req.userId,
      stickerId: new ObjectId(stickerId)
    });

    if (existing) {
      return sendSuccess(res, { favorited: true }, 'Sticker already favorited');
    }

    // Add to favorites
    await db.collection('sticker_favorites').insertOne({
      userId: req.userId,
      stickerId: new ObjectId(stickerId),
      createdAt: new Date().toISOString()
    });

    // Increment favorite count
    await db.collection('stickers').updateOne(
      { _id: new ObjectId(stickerId) },
      { $inc: { favoriteCount: 1 } }
    );

    return sendSuccess(res, { favorited: true }, 'Sticker favorited successfully');

  } catch (error) {
    console.error('Favorite sticker error:', error);
    return sendError(res, error, 'Failed to favorite sticker', 500);
  }
});

// Unfavorite sticker
router.delete('/:stickerId/favorite', verifyToken, stickerLimiter, async (req, res) => {
  try {
    const { stickerId } = req.params;
    if (!isValidObjectId(stickerId)) {
      return sendError(res, 'Invalid sticker ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const result = await db.collection('sticker_favorites').deleteOne({
      userId: req.userId,
      stickerId: new ObjectId(stickerId)
    });

    if (result.deletedCount > 0) {
      // Decrement favorite count
      await db.collection('stickers').updateOne(
        { _id: new ObjectId(stickerId) },
        { $inc: { favoriteCount: -1 } }
      );
    }

    return sendSuccess(res, { favorited: false }, 'Sticker unfavorited successfully');

  } catch (error) {
    console.error('Unfavorite sticker error:', error);
    return sendError(res, error, 'Failed to unfavorite sticker', 500);
  }
});

// Get categories/packs
router.get('/meta/categories', verifyToken, stickerLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const categories = await db.collection('stickers').distinct('category');
    const packs = await db.collection('stickers').distinct('pack');

    return sendSuccess(res, {
      categories: categories,
      packs: packs
    }, 'Categories and packs retrieved successfully');

  } catch (error) {
    console.error('Get categories error:', error);
    return sendError(res, error, 'Failed to get categories', 500);
  }
});

export default router;

