import { ObjectId } from 'mongodb';

export function parseMentions(text) {
  if (!text || typeof text !== 'string') return [];
  
  const mentionRegex = /@([a-zA-Z0-9_]{3,20})/g;
  const mentions = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    const username = match[1];
    if (!mentions.includes(username)) {
      mentions.push(username);
    }
  }
  
  return mentions;
}


export async function validateMentions(db, mentionedUsernames, roomId, isGroup = false) {
  if (!mentionedUsernames || mentionedUsernames.length === 0) return [];
  
  if (isGroup) {
    const group = await db.collection('groups').findOne({ _id: new ObjectId(roomId) });
    if (!group) return [];
    
    const memberIds = group.members.map(m => m.userId);
    const users = await db.collection('users').find({
      username: { $in: mentionedUsernames },
      _id: { $in: memberIds.map(id => new ObjectId(id)) }
    }).project({ _id: 1, username: 1 }).toArray();
    
    return users.map(u => ({
      userId: u._id.toString(),
      username: u.username
    }));
  } else {
    const users = await db.collection('users').find({
      username: { $in: mentionedUsernames }
    }).project({ _id: 1, username: 1 }).toArray();
    
    return users.map(u => ({
      userId: u._id.toString(),
      username: u.username
    }));
  }
}