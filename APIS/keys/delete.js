import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { isValidObjectId } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const keyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Delete API key
router.delete('/:keyId', verifyToken, keyLimiter, async (req, res) => {
  try {
    const { keyId } = req.params;

    if (!isValidObjectId(keyId)) {
      return sendError(res, 'Invalid API key ID format', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const deleteResult = await db.collection('api_keys').deleteOne({
      _id: new ObjectId(keyId),
      userId: req.userId  // Ensure user owns the key
    });

    if (deleteResult.deletedCount === 0) {
      return sendError(res, 'API key not found or unauthorized', 'Not found', 404);
    }

    return sendSuccess(res, null, 'API key deleted successfully');
  } catch (error) {
    console.error('Delete API key error:', error);
    return sendError(res, error, 'Failed to delete API key', 500);
  }
});

export default router;

