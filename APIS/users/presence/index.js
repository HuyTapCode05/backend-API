import express from 'express';
import updateRoutes from './update.js';
import getRoutes from './get.js';

const router = express.Router();

router.use('/', updateRoutes);
router.use('/', getRoutes);

export default router;

