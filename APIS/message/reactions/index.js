import express from 'express';
import addRoutes from './add.js';
import removeRoutes from './remove.js';
import getRoutes from './get.js';

const router = express.Router();

router.use('/', addRoutes);
router.use('/', removeRoutes);
router.use('/', getRoutes);

export default router;

