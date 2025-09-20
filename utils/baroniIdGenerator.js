import User from '../models/User.js';

// Gold Baroni IDs from the provided list (5-digit special IDs)
const GOLD_BARONI_IDS = [
  '00000', '00001', '00002', '00003', '00004', '00005', '00006', '00007', '00008', '00009',
  '01111', '02222', '03333', '04444', '05555', '06666', '07777', '08888', '09999', '10000',
  '11110', '11111', '11112', '11113', '11114', '11115', '11116', '11117', '11118', '11119',
  '12222', '13333', '14444', '15555', '16666', '17777', '18888', '19999', '20000', '21111',
  '22220', '22221', '22222', '22223', '22224', '22225', '22226', '22227', '22228', '22229',
  '23333', '24444', '25555', '26666', '27777', '28888', '29999', '30000', '31111', '32222',
  '33330', '33331', '33332', '33333', '33334', '33335', '33336', '33337', '33338', '33339',
  '34444', '35555', '36666', '37777', '38888', '39999', '40000', '41111', '42222', '43333',
  '44440', '44441', '44442', '44443', '44444', '44445', '44446', '44447', '44448', '44449',
  '45555', '46666', '47777', '48888', '49999', '50000', '51111', '52222', '53333', '54444',
  '55550', '55551', '55552', '55553', '55554', '55555', '55556', '55557', '55558', '55559',
  '56666', '57777', '58888', '59999', '60000', '61111', '62222', '63333', '64444', '65555',
  '66660', '66661', '66662', '66663', '66664', '66665', '66666', '66667', '66668', '66669',
  '67777', '68888', '69999', '70000', '71111', '72222', '73333', '74444', '75555', '76666',
  '77770', '77771', '77772', '77773', '77774', '77775', '77776', '77777', '77778', '77779',
  '78888', '79999', '80000', '81111', '82222', '83333', '84444', '85555', '86666', '87777',
  '88880', '88881', '88882', '88883', '88884', '88885', '88886', '88887', '88888', '88889',
  '89999', '90000', '91111', '92222', '93333', '94444', '95555', '96666', '97777', '98888',
  '99990', '99991', '99992', '99993', '99994', '99995', '99996', '99997', '99998', '99999'
];

/**
* Generates a unique 5-digit standard baroni ID (random)
* @returns {Promise<string>} A unique 5-digit baroni ID
*/
export const generateUniqueBaroniId = async () => {
  let baroniId;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 1000; // Prevent infinite loops
  
  while (!isUnique && attempts < maxAttempts) {
    // Generate a random 5-digit number (10000-99999)
    baroniId = Math.floor(10000 + Math.random() * 90000).toString();
    
    // Check if this ID already exists and is not a gold ID
    const existingUser = await User.findOne({ baroniId });
    const isGoldId = GOLD_BARONI_IDS.includes(baroniId);
    
    if (!existingUser && !isGoldId) {
      isUnique = true;
    }
    
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Unable to generate unique Baroni ID after maximum attempts');
  }
  
  return baroniId;
};

/**
* Generates a unique GOLD baroni ID from the predefined list
* Ensures uniqueness against existing users' `baroniId`.
* @returns {Promise<string>} A unique GOLD baroni ID
*/
export const generateUniqueGoldBaroniId = async () => {
  // Get all currently used gold IDs
  const usedGoldIds = await User.find({ 
    baroniId: { $in: GOLD_BARONI_IDS } 
  }).select('baroniId').lean();
  
  const usedIdsSet = new Set(usedGoldIds.map(user => user.baroniId));
  
  // Find available gold IDs
  const availableGoldIds = GOLD_BARONI_IDS.filter(id => !usedIdsSet.has(id));
  
  if (availableGoldIds.length === 0) {
    throw new Error('No more gold Baroni IDs available');
  }
  
  // Return a random available gold ID
  const randomIndex = Math.floor(Math.random() * availableGoldIds.length);
  return availableGoldIds[randomIndex];
};

/**
* Checks if a baroni ID is a gold ID
* @param {string} baroniId - The baroni ID to check
* @returns {boolean} True if it's a gold ID, false otherwise
*/
export const isGoldBaroniId = (baroniId) => {
  return GOLD_BARONI_IDS.includes(baroniId);
};

/**
* Gets all available gold baroni IDs
* @returns {Promise<string[]>} Array of available gold baroni IDs
*/
export const getAvailableGoldBaroniIds = async () => {
  const usedGoldIds = await User.find({ 
    baroniId: { $in: GOLD_BARONI_IDS } 
  }).select('baroniId').lean();
  
  const usedIdsSet = new Set(usedGoldIds.map(user => user.baroniId));
  
  return GOLD_BARONI_IDS.filter(id => !usedIdsSet.has(id));
};

/**
* Gets all used gold baroni IDs
* @returns {Promise<string[]>} Array of used gold baroni IDs
*/
export const getUsedGoldBaroniIds = async () => {
  const usedGoldIds = await User.find({ 
    baroniId: { $in: GOLD_BARONI_IDS } 
  }).select('baroniId').lean();
  
  return usedGoldIds.map(user => user.baroniId);
};


