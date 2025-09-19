import Availability from '../models/Availability.js';
import Appointment from '../models/Appointment.js';

// Parse a YYYY-MM-DD string into a local Date at midnight (avoids UTC shift)
const parseLocalYMD = (ymd) => {
  const s = String(ymd || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Invalid date format; expected YYYY-MM-DD');
  const year = parseInt(m[1], 10);
  const monthIndex = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  return new Date(year, monthIndex, day);
};

// Format a Date into YYYY-MM-DD using local time
const formatLocalYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Get the next 5 dates for the same weekday starting from a given date
const getNext5WeeklyDates = (startDate) => {
  const dates = [];
  const start = parseLocalYMD(startDate);
  
  for (let i = 1; i <= 5; i++) { // Next 5 dates (not including the start date)
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    dates.push(formatLocalYMD(d));
  }
  
  return dates;
};

// Check if a time slot is booked (has active appointments)
const isTimeSlotBooked = async (userId, availabilityId, timeSlotId) => {
  const appointment = await Appointment.findOne({
    starId: userId,
    availabilityId: availabilityId,
    timeSlotId: timeSlotId,
    status: { $in: ['pending', 'approved'] }
  });
  return !!appointment;
};

// Clean up weekly availabilities when isWeekly is set to false
export const cleanupWeeklyAvailabilities = async (userId) => {
  try {
    console.log(`[WeeklyAvailability] Starting cleanup for user ${userId}`);
    
    // Find all isWeekly=true availabilities for this user
    const weeklyAvailabilities = await Availability.find({
      userId: userId,
      isWeekly: true
    });

    if (weeklyAvailabilities.length === 0) {
      console.log(`[WeeklyAvailability] No weekly availabilities found for user ${userId}`);
      return { processed: 0, removed: 0 };
    }

    let processedCount = 0;
    let removedCount = 0;

    for (const availability of weeklyAvailabilities) {
      processedCount++;
      
      // Check each time slot to see if it's booked
      const availableSlots = [];
      const bookedSlots = [];
      
      for (const timeSlot of availability.timeSlots) {
        const isBooked = await isTimeSlotBooked(userId, availability._id, timeSlot._id);
        
        if (isBooked) {
          bookedSlots.push(timeSlot);
        } else {
          availableSlots.push(timeSlot);
        }
      }
      
      if (bookedSlots.length > 0) {
        // Keep only booked slots, mark as unavailable
        availability.timeSlots = bookedSlots.map(slot => ({
          ...slot,
          status: 'unavailable'
        }));
        availability.isWeekly = false; // Remove weekly flag
        await availability.save();
        console.log(`[WeeklyAvailability] Updated availability ${availability._id} - kept ${bookedSlots.length} booked slots`);
      } else {
        // No booked slots, remove the entire availability
        await availability.deleteOne();
        removedCount++;
        console.log(`[WeeklyAvailability] Removed availability ${availability._id} - no booked slots`);
      }
    }

    console.log(`[WeeklyAvailability] Cleanup completed for user ${userId} - processed: ${processedCount}, removed: ${removedCount}`);
    return { processed: processedCount, removed: removedCount };
    
  } catch (error) {
    console.error(`[WeeklyAvailability] Error during cleanup for user ${userId}:`, error);
    throw error;
  }
};

// Create next 5 weekly availabilities for isWeekly=true availabilities
export const createNextWeeklyAvailabilities = async () => {
  try {
    console.log('[WeeklyAvailability] Starting daily automation to create next weekly availabilities');
    
    // Find all isWeekly=true availabilities
    const weeklyAvailabilities = await Availability.find({
      isWeekly: true
    }).populate('userId');

    if (weeklyAvailabilities.length === 0) {
      console.log('[WeeklyAvailability] No weekly availabilities found');
      return { processed: 0, created: 0 };
    }

    let processedCount = 0;
    let createdCount = 0;

    for (const availability of weeklyAvailabilities) {
      processedCount++;
      
      // Get the next 5 weekly dates for this availability
      const nextDates = getNext5WeeklyDates(availability.date);
      
      for (const nextDate of nextDates) {
        // Check if availability already exists for this date
        const existingAvailability = await Availability.findOne({
          userId: availability.userId,
          date: nextDate
        });
        
        if (!existingAvailability) {
          // Create new availability with the same time slots
          const newAvailability = await Availability.create({
            userId: availability.userId,
            date: nextDate,
            isWeekly: true,
            timeSlots: availability.timeSlots.map(slot => ({
              slot: slot.slot,
              status: 'available' // Reset status to available for new dates
            }))
          });
          
          createdCount++;
          console.log(`[WeeklyAvailability] Created availability ${newAvailability._id} for date ${nextDate}`);
        } else {
          // Merge with existing availability if it doesn't have isWeekly flag
          if (!existingAvailability.isWeekly) {
            const existingSlots = existingAvailability.timeSlots || [];
            const newSlots = availability.timeSlots.map(slot => ({
              slot: slot.slot,
              status: 'available'
            }));
            
            // Create a map of existing slots for easy lookup
            const existingSlotsMap = new Map();
            existingSlots.forEach(slot => {
              existingSlotsMap.set(slot.slot, slot);
            });
            
            // Merge new slots with existing ones
            newSlots.forEach(newSlot => {
              if (!existingSlotsMap.has(newSlot.slot)) {
                existingSlots.push(newSlot);
              }
            });
            
            existingAvailability.timeSlots = existingSlots;
            existingAvailability.isWeekly = true;
            await existingAvailability.save();
            
            console.log(`[WeeklyAvailability] Updated existing availability ${existingAvailability._id} for date ${nextDate}`);
          }
        }
      }
    }

    console.log(`[WeeklyAvailability] Daily automation completed - processed: ${processedCount}, created: ${createdCount}`);
    return { processed: processedCount, created: createdCount };
    
  } catch (error) {
    console.error('[WeeklyAvailability] Error during daily automation:', error);
    throw error;
  }
};

// Main function to run the daily automation
export const runDailyWeeklyAvailabilityAutomation = async () => {
  try {
    console.log('[WeeklyAvailability] Starting daily automation...');
    
    const result = await createNextWeeklyAvailabilities();
    
    console.log('[WeeklyAvailability] Daily automation completed successfully:', result);
    return result;
    
  } catch (error) {
    console.error('[WeeklyAvailability] Daily automation failed:', error);
    throw error;
  }
};

