import express from 'express';
import getRoutes from './get.js';
import markReadRoutes from './markRead.js';
import manageRoutes from './manage.js';

const router = express.Router();

router.use('/', getRoutes);
router.use('/', markReadRoutes);
router.use('/', manageRoutes);

export default router;

