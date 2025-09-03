import User from '../models/User.js';
import Category from '../models/Category.js';
import Dedication from '../models/Dedication.js';
import Service from '../models/Service.js';
import DedicationSample from '../models/DedicationSample.js';
import Appointment from '../models/Appointment.js';
import Availability from '../models/Availability.js';
import LiveShow from '../models/LiveShow.js';
import Transaction from "../models/Transaction.js";

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  pseudo: user.pseudo,
  profilePic: user.profilePic,
  about: user.about,
  profession: user.profession,
  role: user.role,
});

export const getDashboard = async (req, res) => {
  try {
    const user = req.user;
    const role = user.role;

    if (role === 'fan') {
      // Fan dashboard: stars with filled details, categories, and upcoming shows
      const [stars, categories, upcomingShows] = await Promise.all([
        User.find({
          role: 'star',
          // Only include stars that have filled up their details
          $and: [
            { name: { $exists: true, $ne: null } },
            { name: { $ne: '' } },
            { pseudo: { $exists: true, $ne: null } },
            { pseudo: { $ne: '' } },
            { about: { $exists: true, $ne: null } },
            { about: { $ne: '' } },
            { profession: { $exists: true, $ne: null } }
          ]
        })
          .populate('profession')
          .select('name pseudo profilePic about profession')
          .sort({ createdAt: -1 })
          .limit(20),
        Category.find().sort({ name: 1 }),
        // Get all upcoming live shows
        LiveShow.find({
          status: 'active',
          date: { $gt: new Date() }
        })
        .populate('starId', 'name pseudo profilePic')
        .sort({ date: 1 })
        .limit(10)
      ]);

      return res.json({
        success: true,
        data: {
          stars: stars.map(sanitizeUser),
          categories: categories.map(cat => ({
            id: cat._id,
            name: cat.name,
            image: cat.image,
            description: cat.description,
          })),
          upcomingShows: upcomingShows.map(show => ({
            id: show._id,
            sessionTitle: show.sessionTitle,
            date: show.date,
            time: show.time,
            attendanceFee: show.attendanceFee,
            maxCapacity: show.maxCapacity,
            currentAttendees: show.currentAttendees,
            showCode: show.showCode,
            description: show.description,
            thumbnail: show.thumbnail,
            likeCount: Array.isArray(show.likes) ? show.likes.length : 0,
            isLiked: Array.isArray(show.likes) && req.user ? show.likes.some(u => u.toString() === req.user._id.toString()) : false,
            star: show.starId ? {
              id: show.starId._id,
              name: show.starId.name,
              pseudo: show.starId.pseudo,
              profilePic: show.starId.profilePic
            } : null
          }))
        },
      });
    }

    if (role === 'star') {
      // Star dashboard: upcoming bookings, earnings, engaged fans, and live shows
      const [upcomingBookings, earnings, engagedFans, upcomingLiveShows, liveShowEarnings, escrowCoins] = await Promise.all([
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
        }),

        // Get upcoming live shows
        LiveShow.find({
          starId: user._id,
          status: 'active',
          date: { $gt: new Date() }
        })
        .sort({ date: 1 })
        .limit(10),

        // Calculate earnings from live shows
        LiveShow.aggregate([
          { $match: { starId: user._id, status: 'active' } },
          { $group: { _id: null, totalEarnings: { $sum: '$hostingPrice' } } }
        ]),
        // Escrow coins: pending transactions where receiver is the star
        Transaction.aggregate([
          { $match: { receiverId: user._id, status: 'pending' } },
          { $group: { _id: null, escrow: { $sum: '$amount' } } }
        ])
      ]);

      // Get fan details for engaged fans
      const fanDetails = await User.find({
        _id: { $in: engagedFans }
      })
      .select('name pseudo profilePic')
      .limit(20);

      const appointmentEarnings = earnings.length > 0 ? earnings[0].totalEarnings : 0;
      const liveShowEarningsTotal = liveShowEarnings.length > 0 ? liveShowEarnings[0].totalEarnings : 0;
      const totalEarnings = appointmentEarnings + liveShowEarningsTotal;
      const pendingEscrow = escrowCoins.length > 0 ? escrowCoins[0].escrow : 0;

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
          upcomingLiveShows: upcomingLiveShows.map(show => ({
            id: show._id,
            sessionTitle: show.sessionTitle,
            date: show.date,
            time: show.time,
            attendanceFee: show.attendanceFee,
            hostingPrice: show.hostingPrice,
            maxCapacity: show.maxCapacity,
            currentAttendees: show.currentAttendees,
            showCode: show.showCode,
            description: show.description,
            thumbnail: show.thumbnail,
            likeCount: Array.isArray(show.likes) ? show.likes.length : 0,
            isLiked: Array.isArray(show.likes) && req.user ? show.likes.some(u => u.toString() === req.user._id.toString()) : false
          })),
          earnings: {
            totalEarnings,
            appointmentEarnings,
            liveShowEarnings: liveShowEarningsTotal,
            currency: 'USD',
            escrowFunds: pendingEscrow
          },
          engagedFans: fanDetails.map(fan => ({
            id: fan._id,
            name: fan.name,
            pseudo: fan.pseudo,
            profilePic: fan.profilePic
          })),
          stats: {
            totalBookings: upcomingBookings.length,
            totalLiveShows: upcomingLiveShows.length,
            totalEngagedFans: fanDetails.length
          }
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
        .select('name pseudo role createdAt')
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
