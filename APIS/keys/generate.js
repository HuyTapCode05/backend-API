import express from 'express';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const keyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Generate API key
router.post('/generate', verifyToken, keyLimiter, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return sendError(res, 'API key name is required', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const sanitizedName = sanitizeString(name);
    const sanitizedDescription = description ? sanitizeString(description) : null;

    // Generate API key
    const apiKey = `sk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const keyDoc = {
      _id: new ObjectId(),
      userId: req.userId,
      name: sanitizedName,
      description: sanitizedDescription,
      keyHash: keyHash,
      lastUsed: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      isActive: true
    };

    await db.collection('api_keys').insertOne(keyDoc);

    // Return API key only once (never stored in plain text in DB)
    return sendSuccess(res, {
      apiKey: apiKey,
      keyId: keyDoc._id.toString(),
      name: keyDoc.name,
      description: keyDoc.description,
      createdAt: keyDoc.createdAt,
      warning: 'Save this API key now. You will not be able to see it again!'
    }, 'API key generated successfully');
  } catch (error) {
    console.error('Generate API key error:', error);
    return sendError(res, error, 'Failed to generate API key', 500);
  }
});

export default router;

