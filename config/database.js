import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'chat_app';
let db = null;
let client = null;

export async function connectToMongoDB() {
  try {
    if (client) {
      return true;
    }

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB');

    // Create indexes
    await createIndexes();

    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    return false;
  }
}

async function createIndexes() {
  try {
    // Messages indexes
    try {
      await db.collection('messages').createIndex({ roomId: 1, createdAt: -1 });
      await db.collection('messages').createIndex({ userId: 1, createdAt: -1 });
    } catch (e) {
      // Index may already exist
    }

    // Full-text search index for messages
    try {
      const existingIndexes = await db.collection('messages').indexes();
      const textIndex = existingIndexes.find(idx => idx.textIndexVersion);

      if (!textIndex) {
        await db.collection('messages').createIndex(
          { text: 'text', username: 'text' },
          { name: 'messages_text_index', default_language: 'none' }
        );
        console.log('✅ Created full-text search index for messages');
      }
    } catch (e) {
      if (!e.message.includes('already exists') && !e.message.includes('Index already exists')) {
        console.warn('Warning creating text index:', e.message);
      }
    }

    // Groups indexes
    try {
      await db.collection('groups').createIndex({ name: 1 });
      await db.collection('groups').createIndex({ owner: 1 });
      await db.collection('groups').createIndex({ 'members.userId': 1 });
      await db.collection('groups').createIndex({ createdAt: -1 });
    } catch (e) {
      // Index may already exist
    }

    // Users indexes
    try {
      const existingIndexes = await db.collection('users').indexes();
      const usernameIndex = existingIndexes.find(idx => idx.name === 'username_1');
      if (usernameIndex && !usernameIndex.unique) {
        await db.collection('users').dropIndex('username_1');
      }
      await db.collection('users').createIndex({ username: 1 }, { unique: true });
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.warn('Warning creating username index:', e.message);
      }
    }

    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.warn('Warning creating email index:', e.message);
      }
    }

    // Email verification tokens
    try {
      await db.collection('email_verifications').createIndex({ token: 1 }, { unique: true });
      await db.collection('email_verifications').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }); // 1 hour
    } catch (e) {
      // Index may already exist
    }

    // Password reset tokens
    try {
      await db.collection('password_resets').createIndex({ token: 1 }, { unique: true });
      await db.collection('password_resets').createIndex({ userId: 1 });
      await db.collection('password_resets').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }); // 1 hour
    } catch (e) {
      // Index may already exist
    }

    // Refresh tokens
    try {
      await db.collection('refresh_tokens').createIndex({ token: 1 }, { unique: true });
      await db.collection('refresh_tokens').createIndex({ userId: 1 });
      await db.collection('refresh_tokens').createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
    } catch (e) {
      // Index may already exist
    }

    // Friends indexes
    try {
      await db.collection('friends').createIndex({ userId: 1, friendId: 1 }, { unique: true });
      await db.collection('friends').createIndex({ userId: 1, status: 1 });
      await db.collection('friend_requests').createIndex({ fromUserId: 1, toUserId: 1 }, { unique: true });
      await db.collection('friend_requests').createIndex({ toUserId: 1, status: 1 });
    } catch (e) {
      // Index may already exist
    }

    // Notifications indexes
    try {
      await db.collection('notifications').createIndex({ userId: 1, read: 1, createdAt: -1 });
      await db.collection('notifications').createIndex({ userId: 1, type: 1 });
    } catch (e) {
      // Index may already exist
    }

    // Message reactions indexes
    try {
      await db.collection('message_reactions').createIndex({ messageId: 1, userId: 1 }, { unique: true });
      await db.collection('message_reactions').createIndex({ messageId: 1 });
    } catch (e) {
      // Index may already exist
    }

    // Read receipts indexes
    try {
      await db.collection('read_receipts').createIndex({ messageId: 1, userId: 1 }, { unique: true });
      await db.collection('read_receipts').createIndex({ userId: 1, roomId: 1 });
    } catch (e) {
      // Index may already exist
    }

    // User presence indexes
    try {
      await db.collection('user_presence').createIndex({ userId: 1 }, { unique: true });
      await db.collection('user_presence').createIndex({ lastSeen: -1 });
    } catch (e) {
      // Index may already exist
    }

    // Blocked users indexes
    try {
      await db.collection('blocked_users').createIndex({ userId: 1, blockedUserId: 1 }, { unique: true });
      await db.collection('blocked_users').createIndex({ userId: 1 });
      await db.collection('blocked_users').createIndex({ blockedUserId: 1 });
    } catch (e) {
      // Index may already exist
    }

    // Message replies indexes
    try {
      await db.collection('messages').createIndex({ replyToMessageId: 1 });
      await db.collection('messages').createIndex({ roomId: 1, replyToMessageId: 1 });
    } catch (e) {
      // Index may already exist
    }

    // Message mentions indexes
    try {
      await db.collection('messages').createIndex({ 'mentions.userId': 1 });
      await db.collection('messages').createIndex({ roomId: 1, 'mentions.userId': 1 });
    } catch (e) {
      // Index may already exist
    }

    // Stories indexes
    try {
      await db.collection('stories').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-delete
      await db.collection('stories').createIndex({ userId: 1, createdAt: -1 });
      await db.collection('stories').createIndex({ expiresAt: 1, userId: 1 });
    } catch (e) {
      // Index may already exist
    }

    // Activity logs indexes
    try {
      await db.collection('activity_logs').createIndex({ userId: 1, createdAt: -1 });
      await db.collection('activity_logs').createIndex({ userId: 1, action: 1 });
      await db.collection('activity_logs').createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL
    } catch (e) {
      // Index may already exist
    }
  } catch (error) {
    console.warn('Warning creating indexes:', error.message);
  }
}

export function getDB() {
  return db;
}

export async function closeConnection() {
  try {
    if (client) {
      await client.close();
      client = null;
      db = null;
      console.log('✅ MongoDB connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
  }
}

