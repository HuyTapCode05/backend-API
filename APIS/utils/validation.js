export function sanitizeString(input) {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '');
}

export function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username.trim());
}

export function isValidRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') return false;
  const roomIdRegex = /^[a-zA-Z0-9_-]+$/;
  return roomIdRegex.test(roomId.trim());
}

export function whitelistObject(obj, allowedFields) {
  if (!obj || typeof obj !== 'object') return {};
  const result = {};
  allowedFields.forEach(field => {
    if (obj.hasOwnProperty(field)) {
      result[field] = obj[field];
    }
  });
  return result;
}

export function validateText(text, maxLength = 10000) {
  if (!text || typeof text !== 'string') return null;
  const sanitized = sanitizeString(text);
  if (sanitized.length > maxLength) {
    throw new Error(`Text exceeds maximum length of ${maxLength} characters`);
  }
  return sanitized;
}