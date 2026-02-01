import express from 'express';
import getRoutes from './get.js';
import markReadRoutes from './markRead.js';

const router = express.Router();

router.use('/', getRoutes);
router.use('/', markReadRoutes);

export default router;

