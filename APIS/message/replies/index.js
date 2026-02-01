import express from 'express';
import getRoutes from './get.js';

const router = express.Router();

router.use('/', getRoutes);

export default router;

