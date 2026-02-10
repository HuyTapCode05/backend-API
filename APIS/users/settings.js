import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import { whitelistObject, sanitizeString } from '../utils/validation.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const settingsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: 'Too many settings requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

const DEFAULT_SETTINGS = {
  notifications: {
    message: true,
    mention: true,
    friendRequest: true,
    groupInvite: true,
    sound: true,
  },
  privacy: {
    lastSeen: 'friends', // everyone | friends | nobody
    profilePhoto: 'everyone',
    readReceipts: true,
    allowGroupAdd: 'everyone', // everyone | contacts | nobody
  },
  ui: {
    theme: 'light', // light | dark | system
    language: 'vi',
    compactMode: false,
  },
};

function mergeSettings(current = {}, incoming = {}) {
  const result = { ...DEFAULT_SETTINGS, ...current };
  if (incoming.notifications) {
    result.notifications = {
      ...DEFAULT_SETTINGS.notifications,
      ...(current.notifications || {}),
      ...incoming.notifications,
    };
  }
  if (incoming.privacy) {
    result.privacy = {
      ...DEFAULT_SETTINGS.privacy,
      ...(current.privacy || {}),
      ...incoming.privacy,
    };
  }
  if (incoming.ui) {
    result.ui = {
      ...DEFAULT_SETTINGS.ui,
      ...(current.ui || {}),
      ...incoming.ui,
    };
  }
  return result;
}

router.get('/settings', verifyToken, settingsLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { _id: 1, settings: 1 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const settings = mergeSettings(user.settings || {}, {});

    return sendSuccess(res, { userId: user._id.toString(), settings }, 'User settings retrieved successfully');
  } catch (error) {
    console.error('Get user settings error:', error);
    return sendError(res, error, 'Failed to get user settings', 500);
  }
});

router.put('/settings', verifyToken, settingsLimiter, async (req, res) => {
  try {
    const allowedFields = ['notifications', 'privacy', 'ui'];
    const body = whitelistObject(req.body, allowedFields);

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { _id: 1, settings: 1 } }
    );

    if (!user) {
      return sendError(res, 'User not found', 'Not found', 404);
    }

    const currentSettings = user.settings || {};
    const incoming = { ...body };

    if (incoming.privacy) {
      if (incoming.privacy.lastSeen) {
        const v = sanitizeString(incoming.privacy.lastSeen);
        if (!['everyone', 'friends', 'nobody'].includes(v)) {
          return sendError(res, 'Invalid privacy.lastSeen value', 'Validation error', 400);
        }
        incoming.privacy.lastSeen = v;
      }
      if (incoming.privacy.profilePhoto) {
        const v = sanitizeString(incoming.privacy.profilePhoto);
        if (!['everyone', 'friends', 'nobody'].includes(v)) {
          return sendError(res, 'Invalid privacy.profilePhoto value', 'Validation error', 400);
        }
        incoming.privacy.profilePhoto = v;
      }
      if (incoming.privacy.allowGroupAdd) {
        const v = sanitizeString(incoming.privacy.allowGroupAdd);
        if (!['everyone', 'contacts', 'nobody'].includes(v)) {
          return sendError(res, 'Invalid privacy.allowGroupAdd value', 'Validation error', 400);
        }
        incoming.privacy.allowGroupAdd = v;
      }
      if (typeof incoming.privacy.readReceipts !== 'undefined') {
        incoming.privacy.readReceipts = !!incoming.privacy.readReceipts;
      }
    }

    if (incoming.ui) {
      if (incoming.ui.theme) {
        const v = sanitizeString(incoming.ui.theme);
        if (!['light', 'dark', 'system'].includes(v)) {
          return sendError(res, 'Invalid ui.theme value', 'Validation error', 400);
        }
        incoming.ui.theme = v;
      }
      if (incoming.ui.language) {
        incoming.ui.language = sanitizeString(incoming.ui.language).slice(0, 10) || 'vi';
      }
      if (typeof incoming.ui.compactMode !== 'undefined') {
        incoming.ui.compactMode = !!incoming.ui.compactMode;
      }
    }

    if (incoming.notifications) {
      const n = incoming.notifications;
      const normalized = {};
      ['message', 'mention', 'friendRequest', 'groupInvite', 'sound'].forEach((k) => {
        if (typeof n[k] !== 'undefined') {
          normalized[k] = !!n[k];
        }
      });
      incoming.notifications = normalized;
    }

    const newSettings = mergeSettings(currentSettings, incoming);
    const now = new Date().toISOString();

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      {
        $set: {
          settings: newSettings,
          updatedAt: now,
        },
      }
    );

    return sendSuccess(
      res,
      { userId: user._id.toString(), settings: newSettings },
      'User settings updated successfully'
    );
  } catch (error) {
    console.error('Update user settings error:', error);
    return sendError(res, error, 'Failed to update user settings', 500);
  }
});

export default router;


