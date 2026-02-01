import express from 'express';
import sendRoutes from './send.js';
import acceptRoutes from './accept.js';
import rejectRoutes from './reject.js';
import listRequestsRoutes from './listRequests.js';
import listRoutes from './list.js';

const router = express.Router();

router.use('/', sendRoutes);
router.use('/', acceptRoutes);
router.use('/', rejectRoutes);
router.use('/', listRequestsRoutes);
router.use('/', listRoutes);

export default router;

