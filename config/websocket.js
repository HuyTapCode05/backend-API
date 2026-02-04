import { getDB } from './database.js';
import { ObjectId } from 'mongodb';

const activeUsers = new Map(); // userId -> { ws, username, roomId }

export function initWebSocket(wss) {
  wss.on('connection', (ws) => {
    console.log('🔌 New WebSocket client connected');
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        const { type, payload } = data;

        switch (type) {
          case 'join':
            await handleJoin(ws, userId, payload);
            break;

          case 'message':
            await handleMessage(ws, userId, payload);
            break;

          case 'typing':
            handleTyping(userId, payload);
            break;

          case 'leave':
            handleLeave(userId);
            break;

          case 'call_offer':
            handleCallOffer(userId, payload);
            break;

          case 'call_answer':
            handleCallAnswer(userId, payload);
            break;

          case 'call_ice':
            handleCallICE(userId, payload);
            break;

          case 'call_end':
            handleCallEnd(userId, payload);
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }));
        }
      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    });

    ws.on('close', () => {
      handleLeave(userId);
      console.log(`🔌 User ${userId} disconnected`);
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to Chat Server',
      userId
    }));
  });
}

async function handleJoin(ws, userId, payload) {
  try {
    const { username, roomId } = payload;
    
    if (!username || !roomId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Username and roomId are required'
      }));
      return;
    }

    const db = getDB();
    if (!db) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Database not connected'
      }));
      return;
    }

    // Remove user from previous room if exists
    if (activeUsers.has(userId)) {
      const oldUser = activeUsers.get(userId);
      broadcastToRoom(oldUser.roomId, {
        type: 'user_left',
        data: { username: oldUser.username, userId }
      }, userId);
    }

    // Add user to new room
    activeUsers.set(userId, { ws, username, roomId });

    // Notify user of successful join
    ws.send(JSON.stringify({
      type: 'joined',
      data: { userId, username, roomId }
    }));

    // Notify others in room
    broadcastToRoom(roomId, {
      type: 'user_joined',
      data: { username, userId }
    }, userId);

    // Send recent messages
    const recentMessages = await db.collection('messages')
      .find({ roomId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    ws.send(JSON.stringify({
      type: 'messages_history',
      data: recentMessages.reverse()
    }));

    // Send current users in room
    const roomUsers = Array.from(activeUsers.values())
      .filter(user => user.roomId === roomId)
      .map(user => ({
        userId: Array.from(activeUsers.entries()).find(([id, u]) => u === user)?.[0],
        username: user.username
      }));

    ws.send(JSON.stringify({
      type: 'room_users',
      data: roomUsers
    }));

    console.log(`👤 ${username} joined room ${roomId}`);
  } catch (error) {
    console.error('Error in handleJoin:', error);
    try {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to join room'
      }));
    } catch (sendError) {
      console.error('Failed to send error message to client:', sendError);
    }
  }
}

async function handleMessage(ws, userId, payload) {
  try {
    const user = activeUsers.get(userId);
    if (!user) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'You must join a room first'
      }));
      return;
    }

    const { text, fileUrl, fileType, messageType, source } = payload;
    if ((!text || text.trim() === '') && !fileUrl) {
      return;
    }

    const db = getDB();
    if (!db) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Database not connected'
      }));
      return;
    }

    // Get full user info
    const userInfo = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    // Validate source (app, web, api)
    const validSources = ['app', 'web', 'api'];
    const messageSource = source && validSources.includes(source.toLowerCase()) 
      ? source.toLowerCase() 
      : 'web'; // Default to web if not specified or invalid

    const message = {
      _id: new ObjectId(),
      userId: userId,
      username: user.username,
      userAvatar: userInfo?.avatar || null,
      roomId: user.roomId,
      text: text ? text.trim() : '',
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      messageType: messageType || (fileUrl ? 'file' : 'text'),
      source: messageSource, // app, web, api
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Include full user info for real-time
      user: {
        userId: userId,
        username: user.username,
        avatar: userInfo?.avatar || null,
        email: userInfo?.email || null
      }
    };

    // Save to database
    await db.collection('messages').insertOne(message);

    // Broadcast to room with full user info
    broadcastToRoom(user.roomId, {
      type: 'new_message',
      data: message
    });

    const logText = fileUrl ? `📎 [${fileType || 'File'}]` : text.substring(0, 50);
    console.log(`💬 ${user.username} in ${user.roomId}: ${logText}`);
  } catch (error) {
    console.error('Error in handleMessage:', error);
    try {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to send message'
      }));
    } catch (sendError) {
      console.error('Failed to send error message to client:', sendError);
    }
  }
}

function handleTyping(userId, payload) {
  const user = activeUsers.get(userId);
  if (!user) return;

  broadcastToRoom(user.roomId, {
    type: 'user_typing',
    data: { username: user.username, userId, isTyping: payload.isTyping }
  }, userId);
}

function handleLeave(userId) {
  const user = activeUsers.get(userId);
  if (user) {
    broadcastToRoom(user.roomId, {
      type: 'user_left',
      data: { username: user.username, userId }
    }, userId);
    activeUsers.delete(userId);
    console.log(`👋 ${user.username} left room ${user.roomId}`);
  }
}

function broadcastToRoom(roomId, message, excludeUserId = null) {
  let sentCount = 0;
  activeUsers.forEach((user, userId) => {
    if (user.roomId === roomId && userId !== excludeUserId && user.ws.readyState === 1) {
      try {
        user.ws.send(JSON.stringify(message));
        sentCount++;
      } catch (error) {
        console.error('Error sending message to user:', error);
      }
    }
  });
  return sentCount;
}

function sendToUser(userId, message) {
  const user = activeUsers.get(userId);
  if (user && user.ws.readyState === 1) {
    try {
      user.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message to user:', error);
      return false;
    }
  }
  return false;
}

function handleCallOffer(userId, payload) {
  const { callId, recipientId, offer, callType } = payload;
  
  if (!callId || !recipientId || !offer) {
    return;
  }

  const sent = sendToUser(recipientId, {
    type: 'call_offer',
    data: {
      callId,
      callerId: userId,
      offer,
      callType: callType || 'voice'
    }
  });

  if (sent) {
    console.log(`📞 Call offer sent from ${userId} to ${recipientId}`);
  }
}

function handleCallAnswer(userId, payload) {
  const { callId, callerId, answer } = payload;
  
  if (!callId || !callerId || !answer) {
    return;
  }

  const sent = sendToUser(callerId, {
    type: 'call_answer',
    data: {
      callId,
      answererId: userId,
      answer
    }
  });

  if (sent) {
    console.log(`✅ Call answer sent from ${userId} to ${callerId}`);
  }
}

function handleCallICE(userId, payload) {
  const { callId, targetUserId, candidate } = payload;
  
  if (!callId || !targetUserId || !candidate) {
    return;
  }

  const sent = sendToUser(targetUserId, {
    type: 'call_ice',
    data: {
      callId,
      senderId: userId,
      candidate
    }
  });

  if (sent) {
    console.log(`🧊 ICE candidate sent from ${userId} to ${targetUserId}`);
  }
}

function handleCallEnd(userId, payload) {
  const { callId, targetUserId } = payload;
  
  if (!callId || !targetUserId) {
    return;
  }

  const sent = sendToUser(targetUserId, {
    type: 'call_end',
    data: {
      callId,
      endedBy: userId
    }
  });

  if (sent) {
    console.log(`📴 Call ended by ${userId}`);
  }
}

