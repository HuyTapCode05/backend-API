import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { connectToMongoDB } from './config/database.js';
import { initEmailTransporter, testEmailConnection } from './config/email.js';
import authRoutes from './APIS/Auth/index.js';
import usersRoutes from './APIS/users/index.js';
import messageRoutes from './APIS/message/index.js';
import { initWebSocket } from './config/websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create upload directories
const uploadDirs = [
  'Uploads/Images/Avatar',
  'Uploads/Images/emg',
  'Uploads/Images/sticker',
  'Uploads/Images/Chat',
  'Uploads/Video',
  'Uploads/Voice'
];

uploadDirs.forEach(dir => {
  const fullPath = join(__dirname, dir);
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
  }
});

// Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(join(__dirname, 'public')));
uploadDirs.forEach(dir => {
  app.use(`/${dir}`, express.static(join(__dirname, dir)));
});

// API Info endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Chat App API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout',
        verifyEmail: 'POST /api/auth/verify-email',
        resendVerification: 'POST /api/auth/resend-verification',
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password'
      },
      users: {
        me: 'GET /api/users/me',
        getUser: 'GET /api/users/:userId',
        updateProfile: 'PUT /api/users/me',
        uploadAvatar: 'POST /api/users/me/avatar',
        search: 'GET /api/users/search/:query'
      },
      message: {
        upload: 'POST /api/message/upload',
        send: 'POST /api/message/send',
        getMessages: 'GET /api/message/:roomId',
        updateMessage: 'PUT /api/message/:messageId',
        deleteMessage: 'DELETE /api/message/:messageId'
      }
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);      // All auth routes (login, register, verify, password reset, token)
app.use('/api/users', usersRoutes);    // All user routes (profile, avatar, search)
app.use('/api/message', messageRoutes);   

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket
const wss = new WebSocketServer({ server });
initWebSocket(wss);

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    const connected = await connectToMongoDB();
    if (!connected) {
      console.error('❌ Failed to connect to MongoDB');
      process.exit(1);
    }

    // Initialize email transporter
    try {
      const emailInitialized = initEmailTransporter();
      if (emailInitialized) {
        await testEmailConnection();
      }
    } catch (error) {
      console.warn('⚠️  Email initialization warning:', error.message);
      // Continue even if email fails
    }

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket server ready on ws://localhost:${PORT}`);
      console.log(`💬 API ready at http://localhost:${PORT}/api`);
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Exit process for uncaught exceptions
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    console.log('\n🛑 Shutting down...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⚠️  Forcing shutdown...');
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    console.log('\n🛑 SIGTERM received, shutting down...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Global Express error handler - Must be after all routes
app.use((err, req, res, next) => {
  console.error('❌ Express error:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: isDevelopment ? err.stack : undefined,
    statusCode: err.status || 500
  });
});

// 404 handler - Must be after all routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
    statusCode: 404
  });
});

startServer();

