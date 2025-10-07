import Availability from '../models/Availability.js';
import Appointment from '../models/Appointment.js';

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

// Delete a specific time slot from all daily availabilities for a user by slot string
export const deleteTimeSlotFromDailyAvailabilities = async (userId, timeSlotString) => {
  try {
    const dailyAvailabilities = await Availability.find({ userId, isDaily: true });
    if (dailyAvailabilities.length === 0) {
      return { processed: 0, updated: 0, removed: 0 };
    }

    let processed = 0;
    let updated = 0;
    let removed = 0;

    for (const availability of dailyAvailabilities) {
      processed++;
      const timeSlotIndex = availability.timeSlots.findIndex(slot => slot.slot === timeSlotString);
      if (timeSlotIndex === -1) continue;

      const timeSlot = availability.timeSlots[timeSlotIndex];
      const booked = await isTimeSlotBooked(userId, availability._id, timeSlot._id);
      if (booked) continue;

      availability.timeSlots.splice(timeSlotIndex, 1);
      if (availability.timeSlots.length === 0) {
        await availability.deleteOne();
        removed++;
      } else {
        await availability.save();
        updated++;
      }
    }

    return { processed, updated, removed };
  } catch (error) {
    console.error('[DailyAvailability] Error deleting by slot from daily availabilities:', error);
    throw error;
  }
};

// Delete a specific time slot from all daily availabilities for a user by slot ID
export const deleteTimeSlotByIdFromDailyAvailabilities = async (userId, timeSlotId) => {
  try {
    const dailyAvailabilities = await Availability.find({ userId, isDaily: true });
    if (dailyAvailabilities.length === 0) {
      return { processed: 0, updated: 0, removed: 0 };
    }

    let processed = 0;
    let updated = 0;
    let removed = 0;

    for (const availability of dailyAvailabilities) {
      processed++;
      const timeSlotIndex = availability.timeSlots.findIndex(slot => String(slot._id) === String(timeSlotId));
      if (timeSlotIndex === -1) continue;

      const timeSlot = availability.timeSlots[timeSlotIndex];
      const booked = await isTimeSlotBooked(userId, availability._id, timeSlot._id);
      if (booked) continue;

      availability.timeSlots.splice(timeSlotIndex, 1);
      if (availability.timeSlots.length === 0) {
        await availability.deleteOne();
        removed++;
      } else {
        await availability.save();
        updated++;
      }
    }

    return { processed, updated, removed };
  } catch (error) {
    console.error('[DailyAvailability] Error deleting by ID from daily availabilities:', error);
    throw error;
  }
};


