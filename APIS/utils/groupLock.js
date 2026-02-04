import { ObjectId } from 'mongodb';
import { isValidObjectId } from './validation.js';

/**
 * Enforce group lock by PIN.
 * - If roomId is a group (ObjectId) and group.isLocked === true
 *   then require the user to have an active unlock record in `group_unlocks`.
 */
export async function assertRoomUnlocked(db, roomId, userId) {
  if (!roomId || typeof roomId !== 'string') return { ok: true };

  // Only groups use lock (roomId is ObjectId and a group exists)
  if (!isValidObjectId(roomId)) return { ok: true };

  const group = await db.collection('groups').findOne({ _id: new ObjectId(roomId) }, { projection: { isLocked: 1, members: 1 } });
  if (!group) return { ok: true };
  if (!group.isLocked) return { ok: true };

  const isMember = group.members?.some(m => m.userId === userId);
  if (!isMember) {
    return { ok: false, status: 403, error: 'You are not a member of this group' };
  }

  const now = new Date();
  const unlock = await db.collection('group_unlocks').findOne({
    groupId: roomId,
    userId,
    expiresAt: { $gt: now.toISOString() }
  });

  if (!unlock) {
    return { ok: false, status: 423, error: 'This group is locked. Please unlock with PIN.' };
  }

  return { ok: true };
}


