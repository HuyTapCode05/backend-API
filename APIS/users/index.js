// Users API Routes - Tổng hợp tất cả routes users
import express from 'express';
import profileRoutes from './profile.js';
import avatarRoutes from './avatar.js';
import searchRoutes from './search.js';
import presenceRoutes from './presence/index.js';

const router = express.Router();

// Mount all user routes
router.use('/', profileRoutes);  // GET /me, GET /:userId, PUT /me
router.use('/', avatarRoutes);   // POST /me/avatar
router.use('/', searchRoutes);   // GET /search/:query
router.use('/', presenceRoutes); // PUT /status, GET /:userId/status, GET /friends/status

export default router;

