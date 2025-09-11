import LiveShow from '../models/LiveShow.js';

export const generateUniqueShowCode = async () => {
  let showCode;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate a random 4-digit number
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    showCode = `BAR-LIVE-${randomNum}`;

    // Check if this code already exists
    const existingShow = await LiveShow.findOne({ showCode });
    if (!existingShow) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    // Fallback: use timestamp-based code
    const timestamp = Date.now().toString().slice(-4);
    showCode = `BAR-LIVE-${timestamp}`;
  }

  return showCode;
};





