import express from 'express';
import markReadRoutes from './markRead.js';
import getRoutes from './get.js';

const router = express.Router();

router.use('/', markReadRoutes);
router.use('/', getRoutes);

export default router;

