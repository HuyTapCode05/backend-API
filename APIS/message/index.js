import express from 'express';
import uploadRoutes from './upload.js';
import sendRoutes from './send.js';
import getRoutes from './get.js';
import updateRoutes from './update.js';
import searchRoutes from './search.js';
import reactionsRoutes from './reactions/index.js';
import readReceiptsRoutes from './readReceipts/index.js';
import repliesRoutes from './replies/index.js';
import mentionsRoutes from './mentions/index.js';
import pinRoutes from './pin.js';

const router = express.Router();

router.use('/', uploadRoutes);
router.use('/', sendRoutes);
router.use('/', searchRoutes);
router.use('/', getRoutes);
router.use('/', updateRoutes);
router.use('/', reactionsRoutes);
router.use('/', readReceiptsRoutes);
router.use('/', repliesRoutes);
router.use('/', pinRoutes);
router.use('/mentions', mentionsRoutes);

export default router;

