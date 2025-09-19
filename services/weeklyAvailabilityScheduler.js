import cron from 'node-cron';
import { runDailyWeeklyAvailabilityAutomation } from './weeklyAvailabilityService.js';

/**
 * Schedule weekly availability automation
 * Runs daily at 2:00 AM to create next weekly availabilities
 */
export const startWeeklyAvailabilityScheduler = () => {
  // Run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('Running daily weekly availability automation...');
      const result = await runDailyWeeklyAvailabilityAutomation();
      console.log('Weekly availability automation completed:', result);
    } catch (error) {
      console.error('Error in weekly availability automation:', error);
    }
  });

  console.log('Weekly availability scheduler started - running daily at 2:00 AM');
};

/**
 * Stop the weekly availability scheduler
 */
export const stopWeeklyAvailabilityScheduler = () => {
  // Note: node-cron doesn't provide a direct way to stop specific jobs
  // This would need to be implemented with job references if needed
  console.log('Weekly availability scheduler stop requested');
};

