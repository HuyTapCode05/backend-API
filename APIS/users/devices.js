import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { verifyToken } from '../Auth/middleware.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const router = express.Router();

const devicesLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

function getDeviceId(req) {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const deviceInfo = `${userAgent}|${ip}`;
  return crypto.createHash('sha256').update(deviceInfo).digest('hex').substring(0, 16);
}

function getDeviceInfo(req) {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  let deviceName = 'Unknown Device';
  let deviceType = 'unknown';
  let os = 'unknown';
  let browser = 'unknown';

  if (userAgent) {
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      deviceType = 'mobile';
      if (userAgent.includes('Android')) {
        os = 'Android';
        const match = userAgent.match(/Android\s([\d.]+)/);
        if (match) os += ` ${match[1]}`;
      } else if (userAgent.includes('iPhone')) {
        os = 'iOS';
        const match = userAgent.match(/OS\s([\d_]+)/);
        if (match) os += ` ${match[1].replace(/_/g, '.')}`;
      }
    } else {
      deviceType = 'desktop';
      if (userAgent.includes('Windows')) {
        os = 'Windows';
        const match = userAgent.match(/Windows NT ([\d.]+)/);
        if (match) os += ` ${match[1]}`;
      } else if (userAgent.includes('Mac')) {
        os = 'macOS';
        const match = userAgent.match(/Mac OS X ([\d_]+)/);
        if (match) os += ` ${match[1].replace(/_/g, '.')}`;
      } else if (userAgent.includes('Linux')) {
        os = 'Linux';
      }
    }

    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      browser = 'Chrome';
      const match = userAgent.match(/Chrome\/([\d.]+)/);
      if (match) browser += ` ${match[1]}`;
    } else if (userAgent.includes('Firefox')) {
      browser = 'Firefox';
      const match = userAgent.match(/Firefox\/([\d.]+)/);
      if (match) browser += ` ${match[1]}`;
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browser = 'Safari';
      const match = userAgent.match(/Version\/([\d.]+)/);
      if (match) browser += ` ${match[1]}`;
    } else if (userAgent.includes('Edg')) {
      browser = 'Edge';
      const match = userAgent.match(/Edg\/([\d.]+)/);
      if (match) browser += ` ${match[1]}`;
    }

    deviceName = `${os} - ${browser}`;
  }

  return {
    deviceId: getDeviceId(req),
    deviceName,
    deviceType,
    os,
    browser,
    userAgent,
    ip
  };
}

router.get('/devices', verifyToken, devicesLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const sessions = await db.collection('device_sessions')
      .find({ userId: req.userId })
      .sort({ lastActiveAt: -1 })
      .toArray();

    const currentDeviceId = getDeviceId(req);
    
    const devices = sessions.map(session => ({
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      os: session.os,
      browser: session.browser,
      ip: session.ip,
      isCurrent: session.deviceId === currentDeviceId,
      isBlocked: session.isBlocked || false,
      firstLoginAt: session.firstLoginAt,
      lastActiveAt: session.lastActiveAt
    }));

    return sendSuccess(res, {
      devices,
      total: devices.length,
      currentDeviceId
    }, 'Devices retrieved successfully');
  } catch (error) {
    console.error('Get devices error:', error);
    return sendError(res, error, 'Failed to get devices', 500);
  }
});

router.get('/devices/current', verifyToken, devicesLimiter, async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const deviceInfo = getDeviceInfo(req);
    
    const session = await db.collection('device_sessions').findOne({
      userId: req.userId,
      deviceId: deviceInfo.deviceId
    });

    if (!session) {
      return sendSuccess(res, {
        device: {
          ...deviceInfo,
          isCurrent: true,
          isBlocked: false,
          firstLoginAt: null,
          lastActiveAt: null
        }
      }, 'Current device info retrieved (not in sessions)');
    }

    return sendSuccess(res, {
      device: {
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        deviceType: session.deviceType,
        os: session.os,
        browser: session.browser,
        ip: session.ip,
        isCurrent: true,
        isBlocked: session.isBlocked || false,
        firstLoginAt: session.firstLoginAt,
        lastActiveAt: session.lastActiveAt
      }
    }, 'Current device info retrieved successfully');
  } catch (error) {
    console.error('Get current device error:', error);
    return sendError(res, error, 'Failed to get current device', 500);
  }
});

router.delete('/devices/:deviceId', verifyToken, devicesLimiter, async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId || typeof deviceId !== 'string') {
      return sendError(res, 'Invalid device ID', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const currentDeviceId = getDeviceId(req);
    if (deviceId === currentDeviceId) {
      return sendError(res, 'Cannot logout current device. Use logout endpoint instead.', 'Validation error', 400);
    }

    const result = await db.collection('device_sessions').deleteOne({
      userId: req.userId,
      deviceId
    });

    if (result.deletedCount === 0) {
      return sendError(res, 'Device session not found', 'Not found', 404);
    }

    await db.collection('refresh_tokens').deleteMany({
      userId: new ObjectId(req.userId),
      deviceId
    });

    return sendSuccess(res, { deviceId }, 'Device logged out successfully');
  } catch (error) {
    console.error('Logout device error:', error);
    return sendError(res, error, 'Failed to logout device', 500);
  }
});

router.post('/devices/:deviceId/block', verifyToken, devicesLimiter, async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId || typeof deviceId !== 'string') {
      return sendError(res, 'Invalid device ID', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const currentDeviceId = getDeviceId(req);
    if (deviceId === currentDeviceId) {
      return sendError(res, 'Cannot block current device', 'Validation error', 400);
    }

    const result = await db.collection('device_sessions').updateOne(
      { userId: req.userId, deviceId },
      { $set: { isBlocked: true, blockedAt: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return sendError(res, 'Device session not found', 'Not found', 404);
    }

    await db.collection('refresh_tokens').deleteMany({
      userId: new ObjectId(req.userId),
      deviceId
    });

    return sendSuccess(res, { deviceId, isBlocked: true }, 'Device blocked successfully');
  } catch (error) {
    console.error('Block device error:', error);
    return sendError(res, error, 'Failed to block device', 500);
  }
});

router.post('/devices/:deviceId/unblock', verifyToken, devicesLimiter, async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId || typeof deviceId !== 'string') {
      return sendError(res, 'Invalid device ID', 'Validation error', 400);
    }

    const db = getDB();
    if (!db) {
      return sendError(res, 'Database not connected', 'Server error', 500);
    }

    const result = await db.collection('device_sessions').updateOne(
      { userId: req.userId, deviceId },
      { $set: { isBlocked: false }, $unset: { blockedAt: '' } }
    );

    if (result.matchedCount === 0) {
      return sendError(res, 'Device session not found', 'Not found', 404);
    }

    return sendSuccess(res, { deviceId, isBlocked: false }, 'Device unblocked successfully');
  } catch (error) {
    console.error('Unblock device error:', error);
    return sendError(res, error, 'Failed to unblock device', 500);
  }
});

export default router;

