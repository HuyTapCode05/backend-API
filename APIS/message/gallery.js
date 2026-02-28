import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { verifyToken } from '../Auth/middleware.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { isValidObjectId } from '../utils/validation.js';

const router = express.Router();

// GET /room/:roomId/media — Get all media files in a room
router.get('/room/:roomId/media', verifyToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const { type, limit: limitStr, skip: skipStr } = req.query;

        const limit = Math.min(parseInt(limitStr) || 50, 100);
        const skip = parseInt(skipStr) || 0;

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        // If roomId is a group, verify membership
        if (isValidObjectId(roomId)) {
            const group = await db.collection('groups').findOne(
                { _id: new ObjectId(roomId) },
                { projection: { members: 1 } }
            );
            if (group) {
                const isMember = group.members?.some(m => m.userId === req.userId);
                if (!isMember) {
                    return sendError(res, 'You are not a member of this group', 'Forbidden', 403);
                }
            }
        }

        // Build filter for media messages
        const filter = {
            roomId,
            fileUrl: { $ne: null, $exists: true }
        };

        // Filter by media type
        const validTypes = ['image', 'video', 'voice', 'sticker', 'file'];
        if (type && type !== 'all') {
            if (validTypes.includes(type)) {
                filter.messageType = type;
            } else {
                return sendError(res, `Invalid type. Valid: ${validTypes.join(', ')}, all`, 'Validation error', 400);
            }
        } else {
            // Default: all media types
            filter.messageType = { $in: ['image', 'video', 'voice', 'sticker', 'file'] };
        }

        const [media, total] = await Promise.all([
            db.collection('messages')
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .project({
                    _id: 1,
                    userId: 1,
                    username: 1,
                    userAvatar: 1,
                    roomId: 1,
                    fileUrl: 1,
                    fileType: 1,
                    messageType: 1,
                    text: 1,
                    createdAt: 1
                })
                .toArray(),
            db.collection('messages').countDocuments(filter)
        ]);

        // Group by type for summary
        const summary = {};
        media.forEach(m => {
            const t = m.messageType || 'file';
            summary[t] = (summary[t] || 0) + 1;
        });

        return sendSuccess(res, {
            media,
            total,
            returned: media.length,
            hasMore: skip + media.length < total,
            summary
        }, 'Media gallery retrieved');
    } catch (error) {
        console.error('Get media gallery error:', error);
        return sendError(res, error, 'Failed to get media gallery', 500);
    }
});

export default router;
