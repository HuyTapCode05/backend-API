import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { verifyToken } from '../Auth/middleware.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { isValidObjectId } from '../utils/validation.js';

const router = express.Router();

// GET /feed — Get stories from friends (not expired)
router.get('/feed', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const now = new Date().toISOString();

        // Get friend list
        const friendships = await db.collection('friends').find({
            userId: req.userId,
            status: 'accepted'
        }).toArray();

        const friendIds = friendships.map(f => f.friendId);
        // Include self
        friendIds.push(req.userId);

        // Get active stories from friends
        const stories = await db.collection('stories').find({
            userId: { $in: friendIds },
            expiresAt: { $gt: now }
        }).sort({ createdAt: -1 }).toArray();

        // Group stories by user
        const groupedStories = {};
        stories.forEach(story => {
            if (!groupedStories[story.userId]) {
                groupedStories[story.userId] = {
                    userId: story.userId,
                    username: story.username,
                    userAvatar: story.userAvatar,
                    stories: [],
                    hasUnviewed: false
                };
            }
            const isViewed = story.viewerIds.includes(req.userId);
            if (!isViewed) {
                groupedStories[story.userId].hasUnviewed = true;
            }
            groupedStories[story.userId].stories.push({
                ...story,
                isViewed,
                viewerIds: undefined // Don't expose viewer list
            });
        });

        // Sort: unviewed first, then by latest story
        const feed = Object.values(groupedStories).sort((a, b) => {
            if (a.userId === req.userId) return -1; // Own stories always first
            if (b.userId === req.userId) return 1;
            if (a.hasUnviewed && !b.hasUnviewed) return -1;
            if (!a.hasUnviewed && b.hasUnviewed) return 1;
            return 0;
        });

        return sendSuccess(res, { feed, total: feed.length }, 'Stories feed retrieved');
    } catch (error) {
        console.error('Get stories feed error:', error);
        return sendError(res, error, 'Failed to get stories', 500);
    }
});

// GET /me — Get own stories
router.get('/me', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const now = new Date().toISOString();

        const stories = await db.collection('stories').find({
            userId: req.userId,
            expiresAt: { $gt: now }
        }).sort({ createdAt: -1 }).toArray();

        return sendSuccess(res, { stories, total: stories.length }, 'Your stories retrieved');
    } catch (error) {
        console.error('Get my stories error:', error);
        return sendError(res, error, 'Failed to get stories', 500);
    }
});

// GET /user/:userId — Get stories of a specific user
router.get('/user/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!isValidObjectId(userId)) {
            return sendError(res, 'Invalid user ID', 'Validation error', 400);
        }

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const now = new Date().toISOString();

        const stories = await db.collection('stories').find({
            userId,
            expiresAt: { $gt: now }
        }).sort({ createdAt: -1 }).toArray();

        // Remove viewer details if not own stories
        const sanitized = stories.map(s => ({
            ...s,
            viewerIds: s.userId === req.userId ? s.viewerIds : undefined,
            isViewed: s.viewerIds.includes(req.userId)
        }));

        return sendSuccess(res, { stories: sanitized, total: sanitized.length }, 'User stories retrieved');
    } catch (error) {
        console.error('Get user stories error:', error);
        return sendError(res, error, 'Failed to get stories', 500);
    }
});

export default router;
