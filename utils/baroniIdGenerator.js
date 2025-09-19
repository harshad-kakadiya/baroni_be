import User from '../models/User.js';

/**
* Generates a unique 6-digit baroni ID
* @returns {Promise<string>} A unique 6-digit baroni ID
*/
export const generateUniqueBaroniId = async () => {
  let baroniId;
  let isUnique = false;
  
  while (!isUnique) {
    // Generate a random 6-digit number
    baroniId = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Check if this ID already exists
    const existingUser = await User.findOne({ baroniId });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return baroniId;
};

/**
* Generates a unique GOLD baroni ID (6 digits with pattern AAAAAA or ABABAB)
* Ensures uniqueness against existing users' `baroniId`.
* @returns {Promise<string>} A unique GOLD baroni ID
*/
export const generateUniqueGoldBaroniId = async () => {
  let baroniId;
  let isUnique = false;

  while (!isUnique) {
    // Choose pattern: AAAAAA or ABABAB
    const patternType = Math.random() < 0.5 ? 'AAAAAA' : 'ABABAB';

    let a = Math.floor(1 + Math.random() * 9); // 1-9 to avoid leading zero
    let b = Math.floor(Math.random() * 10);
    if (patternType === 'ABABA') {
      if (b === a) b = (b + 1) % 10; // ensure different digits
    } else {
      // AAAAA pattern ignores b, ensure a in 1..9
    }

    const digits = patternType === 'AAAAAA'
      ? [a, a, a, a, a, a]
      : [a, b, a, b, a, b];

    baroniId = digits.join('');

    // Ensure uniqueness
    const existingUser = await User.findOne({ baroniId });
    if (!existingUser) {
      isUnique = true;
    }
  }

  return baroniId;
};


