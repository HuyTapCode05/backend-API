import express from 'express';
import initiateRoutes from './initiate.js';
import manageRoutes from './manage.js';

const router = express.Router();

router.use('/', initiateRoutes);
router.use('/', manageRoutes);

export default router;

