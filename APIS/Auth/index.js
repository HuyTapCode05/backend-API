import express from 'express';
import loginRoutes from './login.js';
import registerRoutes from './register.js';
import emailVerificationRoutes from './emailVerification.js';
import passwordResetRoutes from './passwordReset.js';
import tokenRoutes from './token.js';

const router = express.Router();

router.use('/', loginRoutes);
router.use('/', registerRoutes);
router.use('/', emailVerificationRoutes);
router.use('/', passwordResetRoutes);
router.use('/', tokenRoutes);

export default router;
export { verifyToken } from './middleware.js';

