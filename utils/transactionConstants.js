export const TRANSACTION_TYPES = {
  APPOINTMENT_PAYMENT: 'appointment_payment',
  DEDICATION_REQUEST_PAYMENT: 'dedication_request_payment',
  LIVE_SHOW_ATTENDANCE_PAYMENT: 'live_show_attendance_payment',
  LIVE_SHOW_HOSTING_PAYMENT: 'live_show_hosting_payment',
  SERVICE_PAYMENT: 'service_payment',
  DEDICATION_PAYMENT: 'dedication_payment',
  BECOME_STAR_PAYMENT: 'become_star_payment',
  REFUND: 'refund',
  ADMIN_CREDIT: 'admin_credit',
  ADMIN_DEBIT: 'admin_debit'
};

// Payment Modes
export const PAYMENT_MODES = {
  COIN: 'coin',
  EXTERNAL: 'external',
  HYBRID: 'hybrid'
};

// Transaction Statuses
export const TRANSACTION_STATUSES = {
  INITIATED: 'initiated',
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  FAILED: 'failed'
};

// Default transaction descriptions
export const TRANSACTION_DESCRIPTIONS = {
  [TRANSACTION_TYPES.APPOINTMENT_PAYMENT]: 'Appointment booked',
  [TRANSACTION_TYPES.DEDICATION_REQUEST_PAYMENT]: 'Dedication request submitted',
  [TRANSACTION_TYPES.LIVE_SHOW_ATTENDANCE_PAYMENT]: 'Live show booked',
  [TRANSACTION_TYPES.LIVE_SHOW_HOSTING_PAYMENT]: 'Live show hosting scheduled',
  [TRANSACTION_TYPES.SERVICE_PAYMENT]: 'Service purchased',
  [TRANSACTION_TYPES.DEDICATION_PAYMENT]: 'Dedication purchased',
  [TRANSACTION_TYPES.BECOME_STAR_PAYMENT]: 'Become Star application submitted',
  [TRANSACTION_TYPES.REFUND]: 'Refund processed',
  [TRANSACTION_TYPES.ADMIN_CREDIT]: 'Admin credit adjustment',
  [TRANSACTION_TYPES.ADMIN_DEBIT]: 'Admin debit adjustment'
};

// Helper function to create descriptive transaction messages
export const createTransactionDescription = (type, payerName = '', receiverName = '', payerRole = 'fan', receiverRole = 'star') => {
  const payerDisplayName = payerName && payerName.trim() !== '' ? payerName.trim() : 'User';
  const receiverDisplayName = receiverName && receiverName.trim() !== '' ? receiverName.trim() : 'User';
  
  // Create descriptive messages based on transaction type
  switch (type) {
    case TRANSACTION_TYPES.DEDICATION_REQUEST_PAYMENT:
      return `${payerDisplayName} booked dedication with ${receiverDisplayName}`;
    
    case TRANSACTION_TYPES.APPOINTMENT_PAYMENT:
      return `${payerDisplayName} booked appointment with ${receiverDisplayName}`;
    
    case TRANSACTION_TYPES.LIVE_SHOW_ATTENDANCE_PAYMENT:
      return `${payerDisplayName} booked live show with ${receiverDisplayName}`;
    
    case TRANSACTION_TYPES.LIVE_SHOW_HOSTING_PAYMENT:
      return `${payerDisplayName} hosted live show`;
    
    case TRANSACTION_TYPES.SERVICE_PAYMENT:
      return `${payerDisplayName} booked service with ${receiverDisplayName}`;
    
    case TRANSACTION_TYPES.DEDICATION_PAYMENT:
      return `${payerDisplayName} booked dedication with ${receiverDisplayName}`;
    
    case TRANSACTION_TYPES.BECOME_STAR_PAYMENT:
      return `${payerDisplayName} became star`;
    
    case TRANSACTION_TYPES.REFUND:
      return `Refund processed for ${payerDisplayName}`;
    
    case TRANSACTION_TYPES.ADMIN_CREDIT:
      return `Admin credit for ${payerDisplayName}`;
    
    case TRANSACTION_TYPES.ADMIN_DEBIT:
      return `Admin debit for ${payerDisplayName}`;
    
    default:
      return `${payerDisplayName} transaction with ${receiverDisplayName}`;
  }
};
