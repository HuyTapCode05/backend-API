// Message API Routes - Tổng hợp tất cả routes messages
import express from 'express';
import uploadRoutes from './upload.js';
import sendRoutes from './send.js';
import getRoutes from './get.js';
import updateRoutes from './update.js';

const router = express.Router();

// Mount all message routes
router.use('/', uploadRoutes);  // POST /upload
router.use('/', sendRoutes);    // POST /send
router.use('/', getRoutes);     // GET /:roomId
router.use('/', updateRoutes);  // PUT /:messageId, DELETE /:messageId

export default router;

