import express from 'express';
import createRoutes from './create.js';
import getRoutes from './get.js';
import manageRoutes from './manage.js';

const router = express.Router();

router.use('/', createRoutes);
router.use('/', getRoutes);
router.use('/', manageRoutes);

export default router;
