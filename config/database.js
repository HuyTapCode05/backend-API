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

    // Rooms indexes
    try {
      await db.collection('rooms').createIndex({ name: 1 });
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

