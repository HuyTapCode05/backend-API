import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { verifyToken } from '../Auth/middleware.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { isValidObjectId } from '../utils/validation.js';

const router = express.Router();

// DELETE /:storyId — Delete story (owner only)
router.delete('/:storyId', verifyToken, async (req, res) => {
    try {
        const { storyId } = req.params;

        if (!isValidObjectId(storyId)) {
            return sendError(res, 'Invalid story ID', 'Validation error', 400);
        }

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const story = await db.collection('stories').findOne({ _id: new ObjectId(storyId) });
        if (!story) {
            return sendError(res, 'Story not found', 'Not found', 404);
        }

        if (story.userId !== req.userId) {
            return sendError(res, 'You can only delete your own stories', 'Forbidden', 403);
        }

        await db.collection('stories').deleteOne({ _id: new ObjectId(storyId) });

        return sendSuccess(res, null, 'Story deleted successfully');
    } catch (error) {
        console.error('Delete story error:', error);
        return sendError(res, error, 'Failed to delete story', 500);
    }
});

// POST /:storyId/view — Mark story as viewed
router.post('/:storyId/view', verifyToken, async (req, res) => {
    try {
        const { storyId } = req.params;

        if (!isValidObjectId(storyId)) {
            return sendError(res, 'Invalid story ID', 'Validation error', 400);
        }

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const story = await db.collection('stories').findOne({ _id: new ObjectId(storyId) });
        if (!story) {
            return sendError(res, 'Story not found', 'Not found', 404);
        }

        // Don't count self-views
        if (story.userId === req.userId) {
            return sendSuccess(res, null, 'Own story viewed');
        }

        // Add viewer if not already viewed
        if (!story.viewerIds.includes(req.userId)) {
            await db.collection('stories').updateOne(
                { _id: new ObjectId(storyId) },
                {
                    $addToSet: { viewerIds: req.userId },
                    $inc: { viewCount: 1 }
                }
            );
        }

        return sendSuccess(res, null, 'Story viewed');
    } catch (error) {
        console.error('View story error:', error);
        return sendError(res, error, 'Failed to mark story as viewed', 500);
    }
});

// GET /:storyId/viewers — Get viewers list (owner only)
router.get('/:storyId/viewers', verifyToken, async (req, res) => {
    try {
        const { storyId } = req.params;

        if (!isValidObjectId(storyId)) {
            return sendError(res, 'Invalid story ID', 'Validation error', 400);
        }

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const story = await db.collection('stories').findOne({ _id: new ObjectId(storyId) });
        if (!story) {
            return sendError(res, 'Story not found', 'Not found', 404);
        }

        if (story.userId !== req.userId) {
            return sendError(res, 'Only the story owner can view viewers', 'Forbidden', 403);
        }

        // Fetch viewer details
        const viewers = await db.collection('users').find({
            _id: { $in: story.viewerIds.filter(id => isValidObjectId(id)).map(id => new ObjectId(id)) }
        }).project({ _id: 1, username: 1, avatar: 1 }).toArray();

        return sendSuccess(res, {
            viewers,
            viewCount: story.viewCount
        }, 'Viewers retrieved');
    } catch (error) {
        console.error('Get story viewers error:', error);
        return sendError(res, error, 'Failed to get viewers', 500);
    }
});

// POST /:storyId/react — React to a story
router.post('/:storyId/react', verifyToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const { emoji } = req.body;

        if (!isValidObjectId(storyId)) {
            return sendError(res, 'Invalid story ID', 'Validation error', 400);
        }

        if (!emoji || typeof emoji !== 'string') {
            return sendError(res, 'Emoji is required', 'Validation error', 400);
        }

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const story = await db.collection('stories').findOne({ _id: new ObjectId(storyId) });
        if (!story) {
            return sendError(res, 'Story not found', 'Not found', 404);
        }

        // Check if expired
        if (new Date(story.expiresAt) < new Date()) {
            return sendError(res, 'Story has expired', 'Gone', 410);
        }

        // Remove existing reaction from this user, then add new one
        await db.collection('stories').updateOne(
            { _id: new ObjectId(storyId) },
            { $pull: { reactions: { userId: req.userId } } }
        );

        await db.collection('stories').updateOne(
            { _id: new ObjectId(storyId) },
            {
                $push: {
                    reactions: {
                        userId: req.userId,
                        username: req.username,
                        emoji,
                        createdAt: new Date().toISOString()
                    }
                }
            }
        );

        return sendSuccess(res, null, 'Reaction added');
    } catch (error) {
        console.error('React to story error:', error);
        return sendError(res, error, 'Failed to react to story', 500);
    }
});

// GET /:storyId/reactions — Get story reactions
router.get('/:storyId/reactions', verifyToken, async (req, res) => {
    try {
        const { storyId } = req.params;

        if (!isValidObjectId(storyId)) {
            return sendError(res, 'Invalid story ID', 'Validation error', 400);
        }

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const story = await db.collection('stories').findOne(
            { _id: new ObjectId(storyId) },
            { projection: { reactions: 1, userId: 1 } }
        );

        if (!story) {
            return sendError(res, 'Story not found', 'Not found', 404);
        }

        return sendSuccess(res, {
            reactions: story.reactions || [],
            total: (story.reactions || []).length
        }, 'Reactions retrieved');
    } catch (error) {
        console.error('Get story reactions error:', error);
        return sendError(res, error, 'Failed to get reactions', 500);
    }
});

export default router;
