import jwt from 'jsonwebtoken';
import { getDB } from '../../config/database.js';
import { sendError } from './response.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export function signPinToken(userId, expiresIn = '15m') {
  return jwt.sign({ userId, scope: 'pin_access' }, JWT_SECRET, { expiresIn });
}

export function verifyPinToken(pinToken) {
  try {
    const decoded = jwt.verify(pinToken, JWT_SECRET);
    if (!decoded || decoded.scope !== 'pin_access' || !decoded.userId) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getPinTokenFromReq(req) {
  return req.headers['x-pin-token'] || req.query.pinToken || null;
}

export async function assertPinVerified(req, res) {
  const pinToken = getPinTokenFromReq(req);
  if (!pinToken) {
    sendError(res, 'PIN verification required', 'Forbidden', 403);
    return false;
  }
  const decoded = verifyPinToken(pinToken);
  if (!decoded || decoded.userId !== req.userId) {
    sendError(res, 'Invalid PIN token', 'Forbidden', 403);
    return false;
  }
  return true;
}

export async function isRoomHiddenForUser(userId, roomId) {
  const db = getDB();
  if (!db) return false;
  const record = await db.collection('hidden_rooms').findOne({ userId, roomId, isHidden: true });
  return !!record;
}


