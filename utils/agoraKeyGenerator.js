import User from '../models/User.js';

/**
 * Generates a unique 7-digit numeric key for Agora token generation
 * @returns {Promise<string>} A unique 7-digit numeric key
 */
export async function generateUniqueAgoraKey() {
  let key;
  let isUnique = false;
  
  while (!isUnique) {
    // Generate a 7-digit number (1000000 to 9999999)
    key = Math.floor(Math.random() * 9000000) + 1000000;
    key = key.toString();
    
    // Check if this key already exists
    const existingUser = await User.findOne({ agoraKey: key });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return key;
}

/**
 * Ensures a user has a unique Agora key, generates one if missing
 * @param {Object} user - The user object
 * @returns {Promise<string>} The user's Agora key
 */
export async function ensureUserAgoraKey(user) {
  if (user.agoraKey) {
    return user.agoraKey;
  }
  
  const newKey = await generateUniqueAgoraKey();
  user.agoraKey = newKey;
  await user.save();
  
  return newKey;
}
