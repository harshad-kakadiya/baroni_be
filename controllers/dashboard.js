import User from '../models/User.js';
import Category from '../models/Category.js';
import Dedication from '../models/Dedication.js';
import Service from '../models/Service.js';
import DedicationSample from '../models/DedicationSample.js';
import Appointment from '../models/Appointment.js';
import Availability from '../models/Availability.js';

const sanitizeUser = (user) => ({
  id: user._id,
  baroniId: user.baroniId,
  name: user.name,
  pseudo: user.pseudo,
  profilePic: user.profilePic,
  about: user.about,
  location: user.location,
  profession: user.profession,
  role: user.role,
  availableForBookings: user.availableForBookings,
});

export const getDashboard = async (req, res) => {
  try {
    const user = req.user;
    const role = user.role;

    if (role === 'fan') {
      // Fan dashboard: stars and category
      const [stars, categories] = await Promise.all([
        User.find({ role: 'star' })
          .populate('profession')
          .select('name pseudo profilePic about location profession availableForBookings')
          .sort({ createdAt: -1 })
          .limit(20),
        Category.find().sort({ name: 1 }),
      ]);

      // Add favorite status and availability for stars
      let starsData = stars.map(star => star.toObject());
      
      if (user.role === 'fan') {
        starsData = starsData.map(star => ({
          ...star,
          isFavorite: user.favorites.includes(star._id)
        }));
      } else {
        starsData = starsData.map(star => ({
          ...star,
          isFavorite: false
        }));
      }

      return res.json({
        success: true,
        data: {
          stars: starsData.map(sanitizeUser),
          categories: categories.map(cat => ({
            id: cat._id,
            name: cat.name,
            image: cat.image,
            description: cat.description,
          })),
        },
      });
    }

    if (role === 'star') {
      // Star dashboard: upcoming bookings, earnings, and engaged fans
      const [upcomingBookings, earnings, engagedFans] = await Promise.all([
        // Upcoming approved appointments
        Appointment.find({
          starId: user._id,
          status: 'approved',
          date: { $gte: new Date().toISOString().split('T')[0] } // Today and future dates
        })
        .populate('fanId', 'name pseudo profilePic')
        .sort({ date: 1, time: 1 })
        .limit(10),

        // Calculate earnings from completed appointments
        Appointment.aggregate([
          { $match: { starId: user._id, status: 'approved' } },
          { $group: { _id: null, totalEarnings: { $sum: 100 } } } // Assuming fixed price per appointment
        ]),

        // Get unique fans who have booked appointments
        Appointment.distinct('fanId', {
          starId: user._id,
          status: { $in: ['approved', 'pending'] }
        })
      ]);

      // Get fan details for engaged fans
      const fanDetails = await User.find({
        _id: { $in: engagedFans }
      })
      .select('name pseudo profilePic')
      .limit(20);

      const totalEarnings = earnings.length > 0 ? earnings[0].totalEarnings : 0;

      return res.json({
        success: true,
        data: {
          upcomingBookings: upcomingBookings.map(booking => ({
            id: booking._id,
            fan: {
              id: booking.fanId._id,
              name: booking.fanId.name,
              pseudo: booking.fanId.pseudo,
              profilePic: booking.fanId.profilePic
            },
            date: booking.date,
            time: booking.time,
            status: booking.status
          })),
          earnings: {
            totalEarnings,
            currency: 'USD'
          },
          engagedFans: fanDetails.map(fan => ({
            id: fan._id,
            name: fan.name,
            pseudo: fan.pseudo,
            profilePic: fan.profilePic
          }))
        },
      });
    }

    if (role === 'admin') {
      // Admin dashboard: system overview
      const [totalUsers, totalStars, totalFans, totalCategories, totalAppointments] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: 'star' }),
        User.countDocuments({ role: 'fan' }),
        Category.countDocuments(),
        Appointment.countDocuments(),
      ]);

      const recentUsers = await User.find()
        .select('name pseudo role createdAt availableForBookings')
        .sort({ createdAt: -1 })
        .limit(10);

      const recentAppointments = await Appointment.find()
        .populate('starId', 'name pseudo')
        .populate('fanId', 'name pseudo')
        .sort({ createdAt: -1 })
        .limit(10);

      return res.json({
        success: true,
        data: {
          stats: {
            totalUsers,
            totalStars,
            totalFans,
            totalCategories,
            totalAppointments,
          },
          recentUsers: recentUsers.map(u => ({
            id: u._id,
            name: u.name,
            pseudo: u.pseudo,
            role: u.role,
            availableForBookings: u.availableForBookings,
            createdAt: u.createdAt,
          })),
          recentAppointments: recentAppointments.map(apt => ({
            id: apt._id,
            star: apt.starId ? { id: apt.starId._id, name: apt.starId.name, pseudo: apt.starId.pseudo } : null,
            fan: apt.fanId ? { id: apt.fanId._id, name: apt.fanId.name, pseudo: apt.fanId.pseudo } : null,
            date: apt.date,
            time: apt.time,
            status: apt.status,
            createdAt: apt.createdAt,
          })),
        },
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid user role' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
