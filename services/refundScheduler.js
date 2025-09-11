import cron from 'node-cron';
import { handlePaymentTimeout as processPaymentTimeout } from './paymentCallbackService.js';

/**
 * Schedule payment timeout checks
 * Runs every 5 minutes to check for transactions that need refunding
 */
export const startRefundScheduler = () => {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('Running payment timeout check...');
      const result = await processPaymentTimeout();
      console.log('Payment timeout check completed:', result);
    } catch (error) {
      console.error('Error in payment timeout check:', error);
    }
  });

  console.log('Refund scheduler started - checking every 5 minutes');
};

/**
 * Stop the refund scheduler
 */
export const stopRefundScheduler = () => {
  cron.getTasks().forEach(task => {
    if (task.name === 'payment-timeout-check') {
      task.stop();
    }
  });
  console.log('Refund scheduler stopped');
};
