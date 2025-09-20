import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import DedicationRequest from '../models/DedicationRequest.js';
import LiveShow from '../models/LiveShow.js';
import LiveShowAttendance from '../models/LiveShowAttendance.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

export const getStarAnalytics = async (req, res) => {
  try {
    const starId = req.user._id;
    const { startDate, endDate } = req.query;
    
    // Build date filter object
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.createdAt.$lte = new Date(endDate);
      }
    }
    
    // Combine starId filter with date filter
    const baseFilter = { starId, ...dateFilter };
    const [
      videoCallsData,
      dedicationsData,
      liveShowsData,
      videoMinutesData,
      uniqueFansData,
      profileImpressionsData,
      videoImpressionsData,
      revenueData,
      countryData
    ] = await Promise.all([
      // Video Calls Analytics
      Promise.all([
        Appointment.countDocuments({ ...baseFilter, status: 'completed' }),
        Appointment.countDocuments({ ...baseFilter, status: 'pending' }),
        Appointment.countDocuments({ ...baseFilter, status: 'cancelled' })
      ]),
      
      // Dedications Analytics
      Promise.all([
        DedicationRequest.countDocuments({ ...baseFilter, status: 'completed' }),
        DedicationRequest.countDocuments({ ...baseFilter, status: 'pending' }),
        DedicationRequest.countDocuments({ ...baseFilter, status: 'cancelled' })
      ]),
      
      // Live Shows Analytics
      Promise.all([
        LiveShow.countDocuments({ ...baseFilter, status: 'completed' }),
        LiveShowAttendance.aggregate([
          { $match: { starId: new mongoose.Types.ObjectId(starId), status: 'completed', ...dateFilter } },
          { $group: { _id: null, totalAudience: { $sum: 1 } } }
        ])
      ]),
      
      // Video Minutes Analytics
      Appointment.aggregate([
        { $match: { starId: new mongoose.Types.ObjectId(starId), status: 'completed', callDuration: { $exists: true, $ne: null }, ...dateFilter } },
        { $group: { _id: null, totalMinutes: { $sum: '$callDuration' }, avgDuration: { $avg: '$callDuration' } } }
      ]),
      
      // Unique Fans Reached
      Appointment.distinct('fanId', { ...baseFilter, status: { $in: ['completed', 'approved', 'pending'] } }),
      
      // Profile Impressions - get from User model
      User.findById(starId).select('profileImpressions').then(user => user?.profileImpressions || 0),
      
      // Video Impressions (simulated - you might want to track this separately)
      Appointment.countDocuments({ ...baseFilter, status: 'completed' }).then(count => count * 2), // Placeholder calculation
      
      // Revenue Analytics
      Promise.all([
        // Video Calls Revenue
        Appointment.aggregate([
          { $match: { starId: new mongoose.Types.ObjectId(starId), status: 'completed', ...dateFilter } },
          { $group: { _id: null, totalRevenue: { $sum: '$price' } } }
        ]),
        // Dedications Revenue
        DedicationRequest.aggregate([
          { $match: { starId: new mongoose.Types.ObjectId(starId), status: 'completed', ...dateFilter } },
          { $group: { _id: null, totalRevenue: { $sum: '$price' } } }
        ]),
        // Live Shows Revenue
        LiveShowAttendance.aggregate([
          { $match: { starId: new mongoose.Types.ObjectId(starId), status: 'completed', ...dateFilter } },
          { $group: { _id: null, totalRevenue: { $sum: '$attendanceFee' } } }
        ])
      ]),
      
      // Most Committed Countries
      Appointment.aggregate([
        { $match: { starId: new mongoose.Types.ObjectId(starId), status: { $in: ['completed', 'approved', 'pending'] }, ...dateFilter } },
        { $lookup: { from: 'users', localField: 'fanId', foreignField: '_id', as: 'fan' } },
        { $unwind: '$fan' },
        { $group: { _id: '$fan.country', fanCount: { $sum: 1 } } },
        { $sort: { fanCount: -1 } },
        { $limit: 4 }
      ])
    ]);

    // Process video calls data
    const [totalVideoCalls, pendingVideoCalls, cancelledVideoCalls] = videoCallsData;
    
    // Process dedications data
    const [totalDedications, pendingDedications, cancelledDedications] = dedicationsData;
    
    // Process live shows data
    const [totalLiveShows, audienceData] = liveShowsData;
    const totalAudience = audienceData.length > 0 ? audienceData[0].totalAudience : 0;
    
    // Process video minutes data
    const videoMinutes = videoMinutesData.length > 0 ? videoMinutesData[0] : { totalMinutes: 0, avgDuration: 0 };
    const totalVideoMinutes = Math.round(videoMinutes.totalMinutes || 0);
    const avgDuration = Math.round((videoMinutes.avgDuration || 0) * 10) / 10;
    
    // Process unique fans
    const uniqueFansReached = uniqueFansData.length;
    
    // Process impressions
    const profileImpressions = profileImpressionsData; // Already calculated as fans.length * 3
    const videoImpressions = videoImpressionsData; // Already calculated as completed appointments * 2
    
    // Process revenue data
    const [videoCallsRevenue, dedicationsRevenue, liveShowsRevenue] = revenueData;
    const videoCallsRevenueTotal = videoCallsRevenue.length > 0 ? videoCallsRevenue[0].totalRevenue : 0;
    const dedicationsRevenueTotal = dedicationsRevenue.length > 0 ? dedicationsRevenue[0].totalRevenue : 0;
    const liveShowsRevenueTotal = liveShowsRevenue.length > 0 ? liveShowsRevenue[0].totalRevenue : 0;
    const totalRevenue = videoCallsRevenueTotal + dedicationsRevenueTotal + liveShowsRevenueTotal;

    // Process country data
    const topCountries = countryData.map(country => ({
      country: country._id || 'Unknown',
      fanCount: country.fanCount
    }));

    // Format revenue with commas
    const formatRevenue = (amount) => {
      return amount.toLocaleString('en-US');
    };

    const analytics = {
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null,
        applied: !!(startDate || endDate)
      },
      keyMetrics: {
        videoCalls: {
          total: totalVideoCalls,
          pending: pendingVideoCalls,
          cancelled: cancelledVideoCalls
        },
        dedications: {
          total: totalDedications,
          pending: pendingDedications,
          cancelled: cancelledDedications
        },
        liveShows: {
          total: totalLiveShows,
          totalAudience: totalAudience
        },
        videoMinutes: {
          total: totalVideoMinutes,
          averageDuration: avgDuration
        }
      },
      audienceGrowth: {
        uniqueFansReached: uniqueFansReached,
        profileImpressions: profileImpressions,
        videoImpressions: videoImpressions
      },
      revenue: {
        total: formatRevenue(totalRevenue),
        breakdown: {
          videoCalls: formatRevenue(videoCallsRevenueTotal),
          dedications: formatRevenue(dedicationsRevenueTotal),
          liveShows: formatRevenue(liveShowsRevenueTotal)
        }
      },
      topCountries: topCountries
    };

    return res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Error fetching star analytics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics data'
    });
  }
};

