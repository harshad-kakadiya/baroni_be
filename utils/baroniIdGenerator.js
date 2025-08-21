import User from '../models/User.js';

/**
 * Generates a unique 5-digit baroni ID
 * @returns {Promise<string>} A unique 5-digit baroni ID
 */
export const generateUniqueBaroniId = async () => {
  let baroniId;
  let isUnique = false;
  
  while (!isUnique) {
    // Generate a random 5-digit number
    baroniId = Math.floor(10000 + Math.random() * 90000).toString();
    
    // Check if this ID already exists
    const existingUser = await User.findOne({ baroniId });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return baroniId;
};
