import cron from 'node-cron';
import Appointment from '../models/Appointment.js';
import LiveShow from '../models/LiveShow.js';
import NotificationHelper from '../utils/notificationHelper.js';

class NotificationScheduler {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Initialize all scheduled jobs
   */
  init() {
    // Appointment reminders - run every 5 minutes
    this.scheduleAppointmentReminders();
    
    // Live show reminders - run every 5 minutes
    this.scheduleLiveShowReminders();
    
    console.log('Notification scheduler initialized');
  }

  /**
   * Schedule appointment reminders
   */
  scheduleAppointmentReminders() {
    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.sendAppointmentReminders();
      } catch (error) {
        console.error('Error in appointment reminder job:', error);
      }
    });

    this.jobs.set('appointmentReminders', job);
  }

  /**
   * Schedule live show reminders
   */
  scheduleLiveShowReminders() {
    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.sendLiveShowReminders();
      } catch (error) {
        console.error('Error in live show reminder job:', error);
      }
    });

    this.jobs.set('liveShowReminders', job);
  }

  /**
   * Send appointment reminders for appointments starting within 10 minutes
   */
  async sendAppointmentReminders() {
    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    const appointments = await Appointment.find({
      status: 'approved',
      date: {
        $gte: now,
        $lte: tenMinutesFromNow
      }
    }).populate('starId', 'name pseudo')
      .populate('fanId', 'name pseudo');

    for (const appointment of appointments) {
      try {
        // Check if reminder was already sent (you might want to add a field to track this)
        const timeUntilAppointment = appointment.date.getTime() - now.getTime();
        const minutesUntilAppointment = Math.floor(timeUntilAppointment / (1000 * 60));

        if (minutesUntilAppointment <= 10 && minutesUntilAppointment > 0) {
          // Send video call reminder
          await NotificationHelper.sendVideoCallReminder(appointment);
          
          // Mark as reminder sent (optional - you might want to add a field to the appointment model)
          console.log(`Appointment reminder sent for appointment ${appointment._id}`);
        }
      } catch (error) {
        console.error(`Error sending reminder for appointment ${appointment._id}:`, error);
      }
    }
  }

  /**
   * Send live show reminders for shows starting within 30 minutes
   */
  async sendLiveShowReminders() {
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

    const liveShows = await LiveShow.find({
      status: 'active',
      date: {
        $gte: now,
        $lte: thirtyMinutesFromNow
      }
    }).populate('starId', 'name pseudo');

    for (const liveShow of liveShows) {
      try {
        const timeUntilShow = liveShow.date.getTime() - now.getTime();
        const minutesUntilShow = Math.floor(timeUntilShow / (1000 * 60));

        if (minutesUntilShow <= 30 && minutesUntilShow > 0) {
          // Send live show starting notification
          await NotificationHelper.sendLiveShowNotification('LIVE_SHOW_STARTING', liveShow);
          
          console.log(`Live show reminder sent for show ${liveShow._id}`);
        }
      } catch (error) {
        console.error(`Error sending reminder for live show ${liveShow._id}:`, error);
      }
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`Stopped job: ${name}`);
    }
    this.jobs.clear();
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    const status = {};
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.running,
        nextDate: job.nextDate()
      };
    }
    return status;
  }
}

export default new NotificationScheduler();
