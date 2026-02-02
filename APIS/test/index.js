import express from 'express';
import testRoutes from './routes.js';

const router = express.Router();

router.use('/', testRoutes);

export default router;

