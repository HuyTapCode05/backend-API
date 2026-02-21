import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { sendError } from '../utils/response.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;

  if (!token) {
    return sendError(res, 'No token provided', 'Authentication error', 401);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const { getDB } = await import('../../config/database.js');
    const db = getDB();
    
    if (db) {
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(decoded.userId) },
        { projection: { password: 0 } }
      );

      if (!user) {
        return sendError(res, 'User not found', 'Authentication error', 401);
      }

      if (user.locked || user.disabled) {
        return sendError(res, 'Account is locked or disabled', 'Authentication error', 403);
      }
    }
    
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (error) {
    return sendError(res, 'Invalid token', 'Authentication error', 401);
  }
}

