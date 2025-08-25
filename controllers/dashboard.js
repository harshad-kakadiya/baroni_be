import User from '../models/User.js';
import Category from '../models/Category.js';
import Dedication from '../models/Dedication.js';
import Service from '../models/Service.js';
import DedicationSample from '../models/DedicationSample.js';
import Appointment from '../models/Appointment.js';
import Availability from '../models/Availability.js';
import LiveShow from '../models/LiveShow.js';

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
      const [stars, categories, upcomingShows] = await Promise.all([
        User.find({ role: 'star' })
          .populate('profession')
          .select('name pseudo profilePic about location profession availableForBookings')
          .sort({ createdAt: -1 })
          .limit(20),
        Category.find().sort({ name: 1 }),
        LiveShow.find({ date: { $gt: new Date() }, status: 'scheduled' })
          .populate('starId', 'name pseudo profilePic availableForBookings')
          .sort({ date: 1 })
          .limit(10)
      ]);

      let starsData = stars.map(star => star.toObject());
      if (user.role === 'fan') {
        starsData = starsData.map(star => ({ ...star, isFavorite: user.favorites.includes(star._id) }));
      } else {
        starsData = starsData.map(star => ({ ...star, isFavorite: false }));
      }

      const showsData = upcomingShows.map(show => ({
        ...show.toObject(),
        isFavorite: user.favorites.includes(show.starId._id)
      }));

      return res.json({
        success: true,
        data: {
          stars: starsData.map(sanitizeUser),
          categories: categories.map(cat => ({ id: cat._id, name: cat.name, image: cat.image, description: cat.description })),
          upcomingHighlights: showsData.map(show => ({
            id: show._id,
            sessionTitle: show.sessionTitle,
            date: show.date,
            time: show.time,
            attendanceFee: show.attendanceFee,
            showCode: show.showCode,
            inviteLink: show.inviteLink,
            thumbnail: show.thumbnail,
            description: show.description,
            star: {
              id: show.starId._id,
              name: show.starId.name,
              pseudo: show.starId.pseudo,
              profilePic: show.starId.profilePic,
              availableForBookings: show.starId.availableForBookings,
              isFavorite: show.isFavorite
            }
          }))
        },
      });
    }

    if (role === 'star') {
      const [upcomingBookings, earnings, engagedFans, upcomingShows] = await Promise.all([
        Appointment.find({ starId: user._id, status: 'approved', date: { $gte: new Date().toISOString().split('T')[0] } })
          .populate('fanId', 'name pseudo profilePic')
          .sort({ date: 1, time: 1 })
          .limit(10),
        Appointment.aggregate([{ $match: { starId: user._id, status: 'approved' } }, { $group: { _id: null, totalEarnings: { $sum: 100 } } }]),
        Appointment.distinct('fanId', { starId: user._id, status: { $in: ['approved', 'pending'] } }),
        LiveShow.find({ starId: user._id, date: { $gt: new Date() }, status: 'scheduled' })
          .sort({ date: 1 })
          .limit(5)
      ]);

      const fanDetails = await User.find({ _id: { $in: engagedFans } }).select('name pseudo profilePic').limit(20);
      const totalEarnings = earnings.length > 0 ? earnings[0].totalEarnings : 0;

      return res.json({
        success: true,
        data: {
          upcomingBookings: upcomingBookings.map(booking => ({
            id: booking._id,
            fan: { id: booking.fanId._id, name: booking.fanId.name, pseudo: booking.fanId.pseudo, profilePic: booking.fanId.profilePic },
            date: booking.date,
            time: booking.time,
            status: booking.status
          })),
          earnings: { totalEarnings, currency: 'USD' },
          engagedFans: fanDetails.map(fan => ({ id: fan._id, name: fan.name, pseudo: fan.pseudo, profilePic: fan.profilePic })),
          upcomingHighlights: upcomingShows.map(show => ({
            id: show._id,
            sessionTitle: show.sessionTitle,
            date: show.date,
            time: show.time,
            attendanceFee: show.attendanceFee,
            hostingPrice: show.hostingPrice,
            maxCapacity: show.maxCapacity,
            showCode: show.showCode,
            inviteLink: show.inviteLink,
            currentAttendees: show.currentAttendees,
            description: show.description,
            thumbnail: show.thumbnail
          }))
        },
      });
    }

    if (role === 'admin') {
      const [totalUsers, totalStars, totalFans, totalCategories, totalAppointments, totalLiveShows] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: 'star' }),
        User.countDocuments({ role: 'fan' }),
        Category.countDocuments(),
        Appointment.countDocuments(),
        LiveShow.countDocuments()
      ]);

      const recentUsers = await User.find().select('name pseudo role createdAt availableForBookings').sort({ createdAt: -1 }).limit(10);
      const recentAppointments = await Appointment.find().populate('starId', 'name pseudo').populate('fanId', 'name pseudo').sort({ createdAt: -1 }).limit(10);
      const upcomingLiveShows = await LiveShow.find({ date: { $gt: new Date() }, status: 'scheduled' }).populate('starId', 'name pseudo').sort({ date: 1 }).limit(10);

      return res.json({
        success: true,
        data: {
          stats: { totalUsers, totalStars, totalFans, totalCategories, totalAppointments, totalLiveShows },
          recentUsers: recentUsers.map(u => ({ id: u._id, name: u.name, pseudo: u.pseudo, role: u.role, availableForBookings: u.availableForBookings, createdAt: u.createdAt })),
          recentAppointments: recentAppointments.map(apt => ({ id: apt._id, star: apt.starId ? { id: apt.starId._id, name: apt.starId.name, pseudo: apt.starId.pseudo } : null, fan: apt.fanId ? { id: apt.fanId._id, name: apt.fanId.name, pseudo: apt.fanId.pseudo } : null, date: apt.date, time: apt.time, status: apt.status, createdAt: apt.createdAt })),
          upcomingHighlights: upcomingLiveShows.map(show => ({ id: show._id, sessionTitle: show.sessionTitle, date: show.date, time: show.time, attendanceFee: show.attendanceFee, showCode: show.showCode, star: show.starId ? { id: show.starId._id, name: show.starId.name, pseudo: show.starId.pseudo } : null }))
        },
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid user role' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
