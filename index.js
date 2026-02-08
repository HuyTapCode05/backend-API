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
import groupsRoutes from './APIS/groups/index.js';
import friendsRoutes from './APIS/friends/index.js';
import notificationsRoutes from './APIS/notifications/index.js';
import callsRoutes from './APIS/calls/index.js';
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

// API Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'api-dashboard.html'));
});

// Join group by invite code page
app.get('/join/:code', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'join.html'));
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
        search: 'GET /api/users/search/:query',
        updateStatus: 'PUT /api/users/status',
        getUserStatus: 'GET /api/users/:userId/status',
        getFriendsStatus: 'GET /api/users/friends/status',
        blockUser: 'POST /api/users/block',
        unblockUser: 'POST /api/users/unblock',
        getBlockedUsers: 'GET /api/users/blocked',
        checkBlockStatus: 'GET /api/users/check/:userId'
        ,
        pinSet: 'POST /api/users/pin/set',
        pinVerify: 'POST /api/users/pin/verify',
        pinStatus: 'GET /api/users/pin/status',
        hideRoom: 'POST /api/users/hidden/rooms/:roomId/hide',
        unhideRoom: 'POST /api/users/hidden/rooms/:roomId/unhide',
        hiddenRooms: 'GET /api/users/hidden/rooms?limit=50&skip=0 (requires x-pin-token)',
        hiddenStatus: 'GET /api/users/hidden/rooms/:roomId/status'
      },
      message: {
        upload: 'POST /api/message/upload',
        send: 'POST /api/message/send',
        search: 'GET /api/message/search',
        advancedSearch: 'GET /api/message/search/advanced',
        getMessages: 'GET /api/message/:roomId',
        updateMessage: 'PUT /api/message/:messageId',
        deleteMessage: 'DELETE /api/message/:messageId',
        voiceUpload: 'POST /api/message/voice/upload',
        voiceSend: 'POST /api/message/voice/send',
        archiveRoom: 'POST /api/message/room/:roomId/archive',
        unarchiveRoom: 'POST /api/message/room/:roomId/unarchive',
        getArchiveStatus: 'GET /api/message/room/:roomId/archive-status',
        getArchivedRooms: 'GET /api/message/archived',
        getEditHistory: 'GET /api/message/:messageId/edit-history',
        forward: 'POST /api/message/:messageId/forward',
        bulkDelete: 'POST /api/message/bulk-delete',
        bulkDeleteRoom: 'POST /api/message/room/:roomId/bulk-delete',
        star: 'POST /api/message/:messageId/star',
        unstar: 'DELETE /api/message/:messageId/star',
        getStarred: 'GET /api/message/starred?limit=50&skip=0&roomId=',
        report: 'POST /api/message/:messageId/report',
        recall: 'POST /api/message/:messageId/recall',
        saveDraft: 'POST /api/message/draft',
        getDrafts: 'GET /api/message/drafts?limit=50&skip=0',
        getDraft: 'GET /api/message/draft/:roomId',
        updateDraft: 'PUT /api/message/draft/:draftId',
        deleteDraft: 'DELETE /api/message/draft/:draftId',
        deleteDraftByRoom: 'DELETE /api/message/draft/room/:roomId',
        sendDraft: 'POST /api/message/draft/:draftId/send',
        schedule: 'POST /api/message/schedule',
        getScheduled: 'GET /api/message/scheduled?roomId=&status=&limit=50&skip=0',
        getScheduledById: 'GET /api/message/scheduled/:scheduledId',
        updateScheduled: 'PUT /api/message/scheduled/:scheduledId',
        deleteScheduled: 'DELETE /api/message/scheduled/:scheduledId',
        cancelScheduled: 'POST /api/message/scheduled/:scheduledId/cancel',
        processScheduled: 'POST /api/message/scheduled/process'
      },
      groups: {
        create: 'POST /api/groups',
        list: 'GET /api/groups?type=all|my|public|owned',
        get: 'GET /api/groups/:groupId',
        update: 'PUT /api/groups/:groupId',
        delete: 'DELETE /api/groups/:groupId',
        getMembers: 'GET /api/groups/:groupId/members',
        addMember: 'POST /api/groups/:groupId/members',
        removeMember: 'DELETE /api/groups/:groupId/members/:userId',
        promoteMember: 'POST /api/groups/:groupId/members/:userId/promote',
        demoteAdmin: 'POST /api/groups/:groupId/members/:userId/demote',
        leaveGroup: 'POST /api/groups/:groupId/leave',
        getStatistics: 'GET /api/groups/:groupId/statistics',
        transferOwnership: 'POST /api/groups/:groupId/transfer-ownership',
        generateInviteCode: 'POST /api/groups/:groupId/invite-code',
        joinByCode: 'POST /api/groups/join-by-code',
        getInviteCodes: 'GET /api/groups/:groupId/invite-codes',
        deactivateInviteCode: 'DELETE /api/groups/:groupId/invite-code/:code',
        muteGroup: 'POST /api/groups/:groupId/mute',
        unmuteGroup: 'POST /api/groups/:groupId/unmute',
        getMuteStatus: 'GET /api/groups/:groupId/mute-status',
        getMutedGroups: 'GET /api/groups/muted',
        getReports: 'GET /api/groups/:groupId/reports?status=open|resolved|rejected|all&limit=50&skip=0',
        resolveReport: 'POST /api/groups/:groupId/reports/:reportId/resolve',
        lock: 'POST /api/groups/:groupId/lock',
        unlock: 'POST /api/groups/:groupId/unlock',
        removeLock: 'DELETE /api/groups/:groupId/lock',
        lockStatus: 'GET /api/groups/:groupId/lock-status'
      },
      friends: {
        sendRequest: 'POST /api/friends/request',
        acceptRequest: 'POST /api/friends/accept',
        rejectRequest: 'POST /api/friends/reject',
        getRequests: 'GET /api/friends/requests',
        list: 'GET /api/friends',
        remove: 'DELETE /api/friends/:friendId'
      },
      notifications: {
        get: 'GET /api/notifications?unreadOnly=true&type=friend_request',
        markRead: 'PUT /api/notifications/:notificationId/read',
        markAllRead: 'PUT /api/notifications/read-all',
        unreadCount: 'GET /api/notifications/unread-count',
        delete: 'DELETE /api/notifications/:notificationId',
        clear: 'DELETE /api/notifications/clear?mode=all|read|unread'
      },
      messageReactions: {
        add: 'POST /api/message/:messageId/reaction',
        remove: 'DELETE /api/message/:messageId/reaction',
        get: 'GET /api/message/:messageId/reactions'
      },
      readReceipts: {
        markRead: 'POST /api/message/:messageId/read',
        markAllRead: 'POST /api/message/room/:roomId/read-all',
        getReadStatus: 'GET /api/message/:messageId/read-status',
        getUnreadCount: 'GET /api/message/room/:roomId/unread-count'
      },
      messageReplies: {
        sendReply: 'POST /api/message/send (with replyToMessageId)',
        getReplies: 'GET /api/message/:messageId/replies'
      },
      mentions: {
        getMyMentions: 'GET /api/message/mentions/me',
        getRoomUserMentions: 'GET /api/message/mentions/room/:roomId/user/:userId'
      },
      pinMessages: {
        pin: 'POST /api/message/:messageId/pin',
        unpin: 'DELETE /api/message/:messageId/pin',
        getPinned: 'GET /api/message/room/:roomId/pinned'
      },
      calls: {
        initiate: 'POST /api/calls/initiate',
        accept: 'POST /api/calls/:callId/accept',
        reject: 'POST /api/calls/:callId/reject',
        end: 'POST /api/calls/:callId/end',
        getCall: 'GET /api/calls/:callId',
        getHistory: 'GET /api/calls/history'
      },
      websocket: {
        connect: 'WS /',
        events: ['join', 'message', 'typing', 'leave', 'call_offer', 'call_answer', 'call_ice', 'call_end']
      }
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);      // All auth routes (login, register, verify, password reset, token)
app.use('/api/users', usersRoutes);    // All user routes (profile, avatar, search)
app.use('/api/message', messageRoutes);    // All message routes (upload, send, get, update, delete, search, reactions)
app.use('/api/groups', groupsRoutes);  // All group routes (create, list, get, update, delete, members)
app.use('/api/friends', friendsRoutes);  // All friend routes (request, accept, reject, list)
app.use('/api/notifications', notificationsRoutes);  // All notification routes (get, mark as read)
app.use('/api/calls', callsRoutes);  // All call routes (initiate, accept, reject, end, history)   

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

    // Initialize email transporter (optional)
    try {
      const emailInitialized = initEmailTransporter();
      if (emailInitialized) {
        await testEmailConnection();
        console.log('✅ Email service ready');
      } else {
        console.log('ℹ️  Email service disabled (EMAIL_USER/EMAIL_PASS not set)');
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

