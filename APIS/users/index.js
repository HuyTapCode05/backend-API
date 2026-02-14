
import express from 'express';
import profileRoutes from './profile.js';
import avatarRoutes from './avatar.js';
import searchRoutes from './search.js';
import presenceRoutes from './presence/index.js';
import blockRoutes from './block/index.js';
import pinRoutes from './pin.js';
import hiddenRoomsRoutes from './hiddenRooms.js';
import settingsRoutes from './settings.js';
import devicesRoutes from './devices.js';

const router = express.Router();

router.use('/', profileRoutes);
router.use('/', avatarRoutes);
router.use('/', searchRoutes);
router.use('/', presenceRoutes);
router.use('/', blockRoutes);
router.use('/', pinRoutes);
router.use('/', hiddenRoomsRoutes);
router.use('/', settingsRoutes);
router.use('/', devicesRoutes);

export default router;

