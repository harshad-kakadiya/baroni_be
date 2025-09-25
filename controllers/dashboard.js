import User from '../models/User.js';
import Category from '../models/Category.js';
import Dedication from '../models/Dedication.js';
import Service from '../models/Service.js';
import DedicationSample from '../models/DedicationSample.js';
import Appointment from '../models/Appointment.js';
import Availability from '../models/Availability.js';
import LiveShow from '../models/LiveShow.js';
import Transaction from "../models/Transaction.js";
import Review from '../models/Review.js';
import { createSanitizedUserResponse, sanitizeUserData } from '../utils/userDataHelper.js';

const sanitizeUser = (user) => createSanitizedUserResponse(user);

export const getDashboard = async (req, res) => {
  try {
    const user = req.user;
    const role = user.role;

    if (role === 'fan') {
      // Fan dashboard: stars with filled details, categories, and upcoming shows
      const { country } = req.query || {};

      // Build star criteria
      const starCriteria = {
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
      };

      if (country) {
        starCriteria.country = country;
      }

      const starsQuery = User.find(starCriteria)
        .populate('profession')
        .select('name pseudo profilePic about profession availableForBookings baroniId')
        .sort({ profileImpressions: -1, createdAt: -1 })
        .limit(20);

      const categoriesQuery = Category.find().sort({ name: 1 });

      // Build live show filter
      const liveShowFilter = {
        status: 'pending',
        date: { $gt: new Date() }
      };

      let starIdsForCountry = [];
      if (country) {
        const starIdsDocs = await User.find({ role: 'star', country }).select('_id');
        starIdsForCountry = starIdsDocs.map(s => s._id);
        // If no stars in that country, ensure no shows are returned quickly
        liveShowFilter.starId = { $in: starIdsForCountry.length ? starIdsForCountry : [null] };
      }

      const liveShowsQuery = LiveShow.find(liveShowFilter)
        .populate('starId', 'name pseudo profilePic availableForBookings baroniId agoraKey')
        .sort({ date: 1 })
        .limit(10);

      // Query for top 5 popular stars (based on profile impressions) with random sorting
      const popularStarsQuery = User.find({
        role: 'star',
        profileImpressions: { $gt: 0 }, // Only stars with some profile views
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
        .select('name pseudo profilePic about profession availableForBookings baroniId profileImpressions')
        .sort({ profileImpressions: -1 })
        .limit(20); // Get more than 5 to allow for random selection

      const [stars, categories, upcomingShows, popularStars] = await Promise.all([
        starsQuery,
        categoriesQuery,
        liveShowsQuery,
        popularStarsQuery
      ]);

      // Randomly select top 5 popular stars from the fetched results
      const shuffledPopularStars = [...popularStars].sort(() => Math.random() - 0.5);
      const top5PopularStars = shuffledPopularStars.slice(0, 5).map(sanitizeUser);

      return res.json({
        success: true,
        data: {
          stars: stars.map(sanitizeUser),
          popularStars: top5PopularStars,
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
            star: show.starId ? sanitizeUserData(show.starId) : null
          }))
        },
      });
    }

    if (role === 'star') {
      // Star dashboard: upcoming bookings, earnings, engaged fans, and live shows
      const [upcomingBookings, earnings, engagedFans, upcomingLiveShows, liveShowEarnings, escrowCoins, ratingAgg] = await Promise.all([
        // Upcoming approved appointments
        Appointment.find({
          starId: user._id,
          status: 'approved',
          date: { $gte: new Date().toISOString().split('T')[0] } // Today and future dates
        })
        .populate('fanId', 'name pseudo profilePic agoraKey')
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
          status: 'pending',
          date: { $gt: new Date() }
        })
        .sort({ date: 1 })
        .limit(10),

        // Calculate earnings from live shows
        LiveShow.aggregate([
          { $match: { starId: user._id, status: 'pending' } },
          { $group: { _id: null, totalEarnings: { $sum: '$hostingPrice' } } }
        ]),
        // Escrow coins: pending transactions where receiver is the star
        Transaction.aggregate([
          { $match: { receiverId: user._id, status: 'pending' } },
          { $group: { _id: null, escrow: { $sum: '$amount' } } }
        ]),

        // Star rating: average rating across all reviews for this star
        Review.aggregate([
          { $match: { starId: user._id } },
          { $group: { _id: '$starId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
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

      const starRating = ratingAgg && ratingAgg.length > 0
        ? { average: Number((ratingAgg[0].avg || 0).toFixed(2)), count: ratingAgg[0].count || 0 }
        : { average: 0, count: 0 };

      return res.json({
        success: true,
        data: {
          upcomingBookings: upcomingBookings.map(booking => ({
            id: booking._id,
            fan: booking.fanId ? sanitizeUserData(booking.fanId) : null,
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
          engagedFans: fanDetails.map(fan => sanitizeUserData(fan)),
          rating: starRating,
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
        .populate('starId', 'name pseudo baroniId agoraKey')
        .populate('fanId', 'name pseudo agoraKey')
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
          recentUsers: recentUsers.map(u => sanitizeUserData(u)),
          recentAppointments: recentAppointments.map(apt => ({
            id: apt._id,
            star: apt.starId ? sanitizeUserData(apt.starId) : null,
            fan: apt.fanId ? sanitizeUserData(apt.fanId) : null,
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
