// Message API Routes - Tổng hợp tất cả routes messages
import express from 'express';
import uploadRoutes from './upload.js';
import sendRoutes from './send.js';
import getRoutes from './get.js';
import updateRoutes from './update.js';
import searchRoutes from './search.js';
import reactionsRoutes from './reactions/index.js';
import readReceiptsRoutes from './readReceipts/index.js';

const router = express.Router();

// Mount all message routes
router.use('/', uploadRoutes);  // POST /upload
router.use('/', sendRoutes);    // POST /send
router.use('/', searchRoutes);  // GET /search, GET /search/advanced
router.use('/', getRoutes);     // GET /:roomId
router.use('/', updateRoutes);  // PUT /:messageId, DELETE /:messageId
router.use('/', reactionsRoutes);  // POST /:messageId/reaction, DELETE /:messageId/reaction, GET /:messageId/reactions
router.use('/', readReceiptsRoutes);  // POST /:messageId/read, POST /room/:roomId/read-all, GET /:messageId/read-status, GET /room/:roomId/unread-count

export default router;

