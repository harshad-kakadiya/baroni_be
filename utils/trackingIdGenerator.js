import DedicationRequest from '../models/DedicationRequest.js';

/**
 * Generates a unique tracking ID in format BAR-XXXXX
 * @returns {Promise<string>} A unique tracking ID
 */
export const generateUniqueTrackingId = async () => {
  let trackingId;
  let isUnique = false;
  
  while (!isUnique) {
    // Generate a random 5-character alphanumeric string
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    trackingId = `BAR-${result}`;
    
    // Check if this tracking ID already exists
    const existingRequest = await DedicationRequest.findOne({ trackingId });
    if (!existingRequest) {
      isUnique = true;
    }
  }
  
  return trackingId;
};
