import express from 'express';
import createRoutes from './create.js';
import listRoutes from './list.js';
import getRoutes from './get.js';
import updateRoutes from './update.js';
import membersRoutes from './members.js';

const router = express.Router();

router.use('/', createRoutes);
router.use('/', listRoutes);
router.use('/', getRoutes);
router.use('/', updateRoutes);
router.use('/', membersRoutes);

export default router;

