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

/**
 * Generates a unique GOLD baroni ID in format BAR-GOLD-XXXXX
 * Ensures uniqueness against existing users' `baroniId`.
 * @returns {Promise<string>} A unique GOLD baroni ID
 */
export const generateUniqueGoldBaroniId = async () => {
  let baroniId;
  let isUnique = false;

  while (!isUnique) {
    // Choose pattern: AAAAA or ABABA
    const patternType = Math.random() < 0.5 ? 'AAAAA' : 'ABABA';

    let a = Math.floor(1 + Math.random() * 9); // 1-9 to avoid leading zero
    let b = Math.floor(Math.random() * 10);
    if (patternType === 'ABABA') {
      if (b === a) b = (b + 1) % 10; // ensure different digits
    } else {
      // AAAAA pattern ignores b, ensure a in 1..9
    }

    const digits = patternType === 'AAAAA'
      ? [a, a, a, a, a]
      : [a, b, a, b, a];

    baroniId = digits.join('');

    // Ensure uniqueness
    const existingUser = await User.findOne({ baroniId });
    if (!existingUser) {
      isUnique = true;
    }
  }

  return baroniId;
};


