export const TRANSACTION_TYPES = {
  APPOINTMENT_PAYMENT: 'appointment_payment',
  DEDICATION_REQUEST_PAYMENT: 'dedication_request_payment',
  LIVE_SHOW_ATTENDANCE_PAYMENT: 'live_show_attendance_payment',
  SERVICE_PAYMENT: 'service_payment',
  DEDICATION_PAYMENT: 'dedication_payment',
  REFUND: 'refund',
  ADMIN_CREDIT: 'admin_credit',
  ADMIN_DEBIT: 'admin_debit'
};

// Payment Modes
export const PAYMENT_MODES = {
  COIN: 'coin',
  EXTERNAL: 'external'
};

// Transaction Statuses
export const TRANSACTION_STATUSES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

// Default transaction descriptions
export const TRANSACTION_DESCRIPTIONS = {
  [TRANSACTION_TYPES.APPOINTMENT_PAYMENT]: 'Payment for appointment booking',
  [TRANSACTION_TYPES.DEDICATION_REQUEST_PAYMENT]: 'Payment for dedication request',
  [TRANSACTION_TYPES.LIVE_SHOW_ATTENDANCE_PAYMENT]: 'Payment for live show attendance',
  [TRANSACTION_TYPES.SERVICE_PAYMENT]: 'Payment for service',
  [TRANSACTION_TYPES.DEDICATION_PAYMENT]: 'Payment for dedication',
  [TRANSACTION_TYPES.REFUND]: 'Refund transaction',
  [TRANSACTION_TYPES.ADMIN_CREDIT]: 'Admin credit adjustment',
  [TRANSACTION_TYPES.ADMIN_DEBIT]: 'Admin debit adjustment'
};
