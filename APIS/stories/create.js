import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { verifyToken } from '../Auth/middleware.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const storyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    message: 'Too many stories created, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// POST / — Create a new story
router.post('/', verifyToken, storyLimiter, async (req, res) => {
    try {
        const { type, content, backgroundColor } = req.body;

        if (!type || !content) {
            return sendError(res, 'Type and content are required', 'Validation error', 400);
        }

        const validTypes = ['text', 'image'];
        if (!validTypes.includes(type)) {
            return sendError(res, 'Type must be "text" or "image"', 'Validation error', 400);
        }

        if (type === 'text' && (!content.trim() || content.trim().length > 500)) {
            return sendError(res, 'Text content must be 1-500 characters', 'Validation error', 400);
        }

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const user = await db.collection('users').findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { username: 1, avatar: 1 } }
        );

        if (!user) {
            return sendError(res, 'User not found', 'Not found', 404);
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        const story = {
            userId: req.userId,
            username: user.username,
            userAvatar: user.avatar || null,
            type,
            content: type === 'text' ? sanitizeString(content) : content,
            backgroundColor: type === 'text' ? (backgroundColor || '#1a1a2e') : null,
            viewerIds: [],
            viewCount: 0,
            reactions: [],
            expiresAt: expiresAt.toISOString(),
            createdAt: now.toISOString()
        };

        const result = await db.collection('stories').insertOne(story);
        story._id = result.insertedId;

        return sendSuccess(res, { story }, 'Story created successfully', 201);
    } catch (error) {
        console.error('Create story error:', error);
        return sendError(res, error, 'Failed to create story', 500);
    }
});

export default router;
