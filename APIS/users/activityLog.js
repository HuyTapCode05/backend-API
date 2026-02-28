import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { verifyToken } from '../Auth/middleware.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = express.Router();

// GET /activity-log — Get user's security activity log
router.get('/activity-log', verifyToken, async (req, res) => {
    try {
        const { limit: limitStr, skip: skipStr, type } = req.query;

        const limit = Math.min(parseInt(limitStr) || 50, 100);
        const skip = parseInt(skipStr) || 0;

        const db = getDB();
        if (!db) {
            return sendError(res, 'Database not connected', 'Server error', 500);
        }

        const filter = { userId: req.userId };

        // Filter by action type
        const validTypes = ['login', 'logout', 'password_change', 'password_reset', 'device_login', 'email_verified', 'block_user', 'unblock_user'];
        if (type) {
            if (validTypes.includes(type)) {
                filter.action = type;
            } else {
                return sendError(res, `Invalid type. Valid: ${validTypes.join(', ')}`, 'Validation error', 400);
            }
        }

        const [logs, total] = await Promise.all([
            db.collection('activity_logs')
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),
            db.collection('activity_logs').countDocuments(filter)
        ]);

        return sendSuccess(res, {
            logs,
            total,
            returned: logs.length,
            hasMore: skip + logs.length < total
        }, 'Activity log retrieved');
    } catch (error) {
        console.error('Get activity log error:', error);
        return sendError(res, error, 'Failed to get activity log', 500);
    }
});

export default router;

// Helper function to be used by other modules
export async function logActivity(userId, action, details = {}) {
    try {
        const db = getDB();
        if (!db) return;

        await db.collection('activity_logs').insertOne({
            userId,
            action,
            details,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
        // Don't throw — activity logging should not break main flow
    }
}
