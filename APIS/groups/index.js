import express from 'express';
import createRoutes from './create.js';
import listRoutes from './list.js';
import getRoutes from './get.js';
import updateRoutes from './update.js';
import membersRoutes from './members.js';
import statisticsRoutes from './statistics.js';
import inviteRoutes from './invite.js';

const router = express.Router();

router.use('/', createRoutes);
router.use('/', listRoutes);
router.use('/', getRoutes);
router.use('/', updateRoutes);
router.use('/', membersRoutes);
router.use('/', statisticsRoutes);
router.use('/', inviteRoutes);

export default router;

