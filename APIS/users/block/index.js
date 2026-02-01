import express from 'express';
import blockRoutes from './block.js';
import unblockRoutes from './unblock.js';
import listRoutes from './list.js';

const router = express.Router();

router.use('/', blockRoutes);
router.use('/', unblockRoutes);
router.use('/', listRoutes);

export default router;

