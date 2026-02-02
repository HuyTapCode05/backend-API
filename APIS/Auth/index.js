// Auth API Routes - Tổng hợp tất cả routes authentication
import express from 'express';
import loginRoutes from './login.js';
import registerRoutes from './register.js';
import emailVerificationRoutes from './emailVerification.js';
import passwordResetRoutes from './passwordReset.js';
import tokenRoutes from './token.js';

const router = express.Router();

// Mount all auth routes
router.use('/', loginRoutes);           // POST /login
router.use('/', registerRoutes);        // POST /register
router.use('/', emailVerificationRoutes); // POST /verify-email, POST /resend-verification
router.use('/', passwordResetRoutes);   // POST /forgot-password, POST /reset-password
router.use('/', tokenRoutes);          // POST /refresh, POST /logout

export default router;
export { verifyToken } from './middleware.js';

