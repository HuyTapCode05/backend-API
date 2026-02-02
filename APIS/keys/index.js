import express from 'express';
import generateRoutes from './generate.js';
import listRoutes from './list.js';
import deleteRoutes from './delete.js';

const router = express.Router();

router.use('/', generateRoutes);  // POST /generate
router.use('/', listRoutes);      // GET /list
router.use('/', deleteRoutes);    // DELETE /:keyId

export default router;

