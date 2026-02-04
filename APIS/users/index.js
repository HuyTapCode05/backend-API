
import express from 'express';
import profileRoutes from './profile.js';
import avatarRoutes from './avatar.js';
import searchRoutes from './search.js';
import presenceRoutes from './presence/index.js';
import blockRoutes from './block/index.js';

const router = express.Router();

router.use('/', profileRoutes);
router.use('/', avatarRoutes);
router.use('/', searchRoutes);
router.use('/', presenceRoutes);
router.use('/', blockRoutes);

export default router;

