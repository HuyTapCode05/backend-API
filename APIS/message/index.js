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
import voiceRoutes from './voice.js';
import archiveRoutes from './archive.js';
import editHistoryRoutes from './editHistory.js';
import forwardRoutes from './forward.js';
import bulkDeleteRoutes from './bulkDelete.js';
import starRoutes from './star.js';
import reportRoutes from './report.js';
import recallRoutes from './recall.js';

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
router.use('/voice', voiceRoutes);
router.use('/', archiveRoutes);
router.use('/', editHistoryRoutes);
router.use('/', forwardRoutes);
router.use('/', bulkDeleteRoutes);
router.use('/', starRoutes);
router.use('/', reportRoutes);
router.use('/', recallRoutes);

export default router;

