import bcrypt from 'bcryptjs';
import {validationResult} from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Dedication from '../models/Dedication.js';
import Service from '../models/Service.js';
import DedicationSample from '../models/DedicationSample.js';
import {createAccessToken, createRefreshToken, verifyRefreshToken} from '../utils/token.js';
import {uploadFile} from '../utils/uploadFile.js';
import {uploadVideo} from '../utils/uploadFile.js';
import {generateUniqueBaroniId} from '../utils/baroniIdGenerator.js';
import {initializeUserCoins} from '../services/transactionService.js';
import DedicationRequest from '../models/DedicationRequest.js';
import Availability from '../models/Availability.js';
import Appointment from '../models/Appointment.js';
import ContactSupport from '../models/ContactSupport.js';
import Transaction from '../models/Transaction.js';
import LiveShowAttendance from '../models/LiveShowAttendance.js';
import mongoose from 'mongoose';
import { normalizeContact } from '../utils/normalizeContact.js';
import { generateUniqueAgoraKey } from '../utils/agoraKeyGenerator.js';
import { createSanitizedUserResponse, sanitizeUserData } from '../utils/userDataHelper.js';
import axios from 'axios';
import  qs  from 'qs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken'
import Otp from "../models/otp.js";

const sanitizeUser = (user) => createSanitizedUserResponse(user);

const convertToBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  if (typeof value === 'number') return value === 1;
  return Boolean(value);
};

function generate6DigitOtp() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

export const sendOtpController = async (req, res) => {
    try {
        const { numero } = req.body ?? {};
        if (!numero) {
            return res
                .status(400)
                .json({ ok: false, error: "numero (contact) is required" });
        }

        const senderName = "Baroni";
        const otp = generate6DigitOtp();
        const corps = `Your verification code is ${otp}`;
        const form = { numero, corps, senderName };
        const gatewayUrl = "http://35.242.129.85:8190/send-message";

        const response = await axios.post(gatewayUrl, qs.stringify(form), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
        });

        const token = jwt.sign({ numero, otp }, "this is you", { expiresIn: "5m" });

        await Otp.create({
            contact: numero,
            otp,
            token,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        return res.json({
            ok: true,
            gatewayStatus: response.status,
            gatewayData: response.data,
            token,
            otp,
        });
    } catch (err) {
        console.error(
            "sendOtpController error:",
            err?.response?.data ?? err.message ?? err
        );
        return res.status(500).json({
            ok: false,
            error: "Failed to send OTP",
            details: err?.response?.data ?? err.message,
        });
    }
};

export const verifyOtpController = async (req, res) => {
    try {
        const { otp, token } = req.body ?? {};

        if (!otp || !token) {
            return res.status(400).json({
                ok: false,
                error: "otp and token are required",
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, "this is you");
        } catch (err) {
            return res.status(401).json({
                ok: false,
                error: "Invalid or expired token",
            });
        }

        const contact = decoded.numero;

        if (!contact) {
            return res.status(400).json({
                ok: false,
                error: "Contact not found in token",
            });
        }

        const otpRecord = await Otp.findOne({ contact }).sort({ createdAt: -1 });

        if (!otpRecord) {
            return res.status(404).json({
                ok: false,
                error: "OTP not found or expired",
            });
        }

        if (otpRecord.otp !== otp) {
            return res.status(400).json({
                ok: false,
                error: "Invalid OTP",
            });
        }

        await Otp.deleteOne({ _id: otpRecord._id });

        return res.json({
            ok: true,
            message: "OTP verified successfully",
            contact,
        });

    } catch (err) {
        console.error("verifyOtpController error:", err);
        return res.status(500).json({
            ok: false,
            error: "OTP verification failed",
            details: err.message,
        });
    }
};

export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

  const { contact, email, password, role, fcmToken, apnsToken, voipToken, deviceType, isDev } = req.body;
  const normalizedContact = typeof contact === 'string' ? normalizeContact(contact) : contact;

    // Check if we have either contact or email
    if (!contact && !email) {
      return res.status(400).json({
        success: false,
        message: 'Either contact number or email is required'
      });
    }

    // If email is provided, password is required
    if (normalizedContact && !password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required when registering with contact'
      });
    }

    const normalizedEmail = email ? email.toLowerCase() : undefined;
    const orQueries = [];
    if (normalizedEmail) orQueries.push({ email: normalizedEmail });
    if (normalizedContact) orQueries.push({ contact: normalizedContact });

    const existing = orQueries.length ? await User.findOne({ $or: orQueries }) : null;
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email or contact already in use'
      });
    }

  // Do not generate baroni ID at registration; Baroni ID is for stars only

    // Hash password only if provided, otherwise set to nul
    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

  // Convert isDev to boolean if provided
  const booleanIsDev = typeof isDev !== 'undefined' ? convertToBoolean(isDev) : false;

  const user = await User.create({
      contact: normalizedContact,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      ...(fcmToken ? { fcmToken } : {}),
      ...(apnsToken ? { apnsToken } : {}),
      ...(voipToken ? { voipToken } : {}),
      ...(deviceType ? { deviceType } : {}),
      ...(typeof isDev !== 'undefined' ? { isDev: booleanIsDev } : {})
    });

    // Generate unique Agora key for the user
    const agoraKey = await generateUniqueAgoraKey();
    user.agoraKey = agoraKey;

    // Initialize user with 20 coins
    await initializeUserCoins(user._id);

    // Auto-login
    // Start a new session version
    user.sessionVersion = (typeof user.sessionVersion === 'number' ? user.sessionVersion : 0) + 1;
    await user.save();

    const accessToken = createAccessToken({ userId: user._id, sessionVersion: user.sessionVersion });
    const refreshToken = createRefreshToken({ userId: user._id, sessionVersion: user.sessionVersion });

    return res.status(201).json({
      success: true,
      message: 'Registered successfully',
      data: {
        user: sanitizeUser(user),
        tokens: { accessToken, refreshToken }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { contact, email, isMobile, fcmToken, apnsToken, voipToken, deviceType, isDev } = req.body;
    const normalizedContact = typeof contact === 'string' ? normalizeContact(contact) : contact;
    let user;

    if (isMobile) {
      if (!normalizedContact) return res.status(400).json({ success: false, message: 'Contact is required for mobile login' });
      if (normalizedContact && !req.body.password) {
        return res.status(400).json({
          success: false,
          message: 'Password is required when login with contact'
        });
      }
      user = await User.findOne({ contact: normalizedContact });
    } else {
      // Email login - allow login with just email when isMobile is false
      if (!email) return res.status(400).json({ success: false, message: 'Email is required for email login' });
      user = await User.findOne({ email: email.toLowerCase() });
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // For mobile login, password is required
    if (isMobile) {
      if (!user.password && user.contact) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (req.body.password) {
        const ok = await bcrypt.compare(req.body.password, user.password);
        if (!ok) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
      }
    } else {
      // For email login, password is optional
      if (req.body.password && user.password) {
        const ok = await bcrypt.compare(req.body.password, user.password);
        if (!ok) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
      }
    }

    // Update tokens and device type if provided
    const updateData = {};
    const unsetData = {};

    // If no tokens are provided, clear existing tokens
    if (!fcmToken && !apnsToken && !voipToken) {
      unsetData.fcmToken = 1;
      unsetData.apnsToken = 1;
      unsetData.voipToken = 1;
      console.log(`User ${user._id} login without tokens - clearing existing tokens`);
    } else {
      // Update tokens if provided
      if (fcmToken) updateData.fcmToken = fcmToken;
      if (apnsToken) updateData.apnsToken = apnsToken;
      if (voipToken) updateData.voipToken = voipToken;
    }

    if (deviceType) {
      updateData.deviceType = deviceType;

      // Clean up tokens based on device type
      if (deviceType === 'android') {
        // Remove iOS tokens when switching to Android
        unsetData.apnsToken = 1;
        unsetData.voipToken = 1;
        console.log(`User ${user._id} switching to Android - removing iOS tokens`);
      } else if (deviceType === 'ios') {
        // Remove FCM token when switching to iOS
        unsetData.fcmToken = 1;
        console.log(`User ${user._id} switching to iOS - removing FCM token`);
      }
    }

    // Handle isDev parameter - convert string to boolean if needed
    if (typeof isDev !== 'undefined') {
      const booleanIsDev = convertToBoolean(isDev);
      updateData.isDev = booleanIsDev;
      console.log(`User ${user._id} setting isDev to ${booleanIsDev} (converted from ${typeof isDev}: ${isDev})`);
    }

    // Increment sessionVersion to invalidate tokens from other devices
    user.sessionVersion = (typeof user.sessionVersion === 'number' ? user.sessionVersion : 0) + 1;
    updateData.sessionVersion = user.sessionVersion;

    // Update user with new tokens and session version
    if (Object.keys(updateData).length > 0 || Object.keys(unsetData).length > 0) {
      const finalUpdateData = { ...updateData };
      if (Object.keys(unsetData).length > 0) {
        finalUpdateData.$unset = unsetData;
      }
      await User.findByIdAndUpdate(user._id, finalUpdateData);
    }

    const accessToken = createAccessToken({ userId: user._id, sessionVersion: user.sessionVersion });
    const refreshToken = createRefreshToken({ userId: user._id, sessionVersion: user.sessionVersion });

    return res.json({ success: true, message: 'Login successful', data: sanitizeUser(user), tokens: { accessToken, refreshToken } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const completeProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { name, pseudo, preferredLanguage, preferredCurrency, country, email, contact, about, location, profession, profilePic, availableForBookings, appNotification, hidden } = req.body;
    let { dedications, services, dedicationSamples } = req.body;


    if (pseudo) {
      const exists = await User.exists({ _id: { $ne: user._id }, pseudo });
      if (exists) return res.status(409).json({ success: false, message: 'Pseudo already in use' });
    }

    if (email) user.email = email.toLowerCase();
    if (contact) user.contact = contact;
    if (name) user.name = name;
    if (pseudo) user.pseudo = pseudo;
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (preferredCurrency) user.preferredCurrency = preferredCurrency;
    if (country) user.country = country;
    if (about) user.about = about;
    if (location) user.location = location;
    if (profession) {
      // Validate that profession category exists
      const professionExists = await Category.exists({ _id: profession });
      if (!professionExists) {
        return res.status(404).json({ success: false, message: 'Profession category not found' });
      }
      user.profession = profession;
    }

    // Handle availableForBookings field (coerce string/values to boolean)
    if (typeof availableForBookings !== 'undefined') {
      const toBoolean = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          return ['true', '1', 'yes', 'on'].includes(normalized);
        }
        return Boolean(value);
      };
      user.availableForBookings = toBoolean(availableForBookings);
    }

    // Handle appNotification field (coerce string to boolean if needed)
    if (typeof appNotification !== 'undefined') {
      const toBoolean = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          return ['true', '1', 'yes', 'on'].includes(normalized);
        }
        return Boolean(value);
      };
      user.appNotification = toBoolean(appNotification);
    }

    // Handle hidden field (coerce string to boolean if needed)
    if (typeof hidden !== 'undefined') {
      const toBoolean = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          return ['true', '1', 'yes', 'on'].includes(normalized);
        }
        return Boolean(value);
      };
      user.hidden = toBoolean(hidden);
    }

    // Handle profile picture update
    if (req.files && req.files.length > 0) {
      const profilePicFile = req.files.find(file => file.fieldname === 'profilePic');
      if (profilePicFile && profilePicFile.buffer) {
        user.profilePic = await uploadFile(profilePicFile.buffer);
      }
    } else if (profilePic && typeof profilePic === 'string') {
      // If profilePic is provided as a URL string, use it directly
      user.profilePic = profilePic;
    }

    // Normalize dedications/services if provided as JSON strings
    if (typeof dedications === 'string') {
      try {
        dedications = JSON.parse(dedications);
      } catch (_e) {
        return res.status(400).json({ success: false, message: 'Invalid JSON for dedications' });
      }
    }
    if (typeof services === 'string') {
      try {
        services = JSON.parse(services);
      } catch (_e) {
        return res.status(400).json({ success: false, message: 'Invalid JSON for services' });
      }
    }
    if (typeof dedicationSamples === 'string') {
      try {
        dedicationSamples = JSON.parse(dedicationSamples);
      } catch (_e) {
        return res.status(400).json({ success: false, message: 'Invalid JSON for dedicationSamples' });
      }
    }

    // Allow non-fan users to optionally initialize dedications and services in complete profile
    if (user.role !== 'fan') {
      try {
        if (Array.isArray(dedications)) {
          const payload = dedications
            .filter((d) => d && typeof d.type === 'string' && d.type.trim())
            .map((d) => ({ type: d.type.trim(), price: Number(d.price) || 0, userId: user._id }));
          if (payload.length) {
            await Dedication.deleteMany({ userId: user._id });
            await Dedication.insertMany(payload);
          }
        }
        if (Array.isArray(services)) {
          const payload = services
            .filter((s) => s && typeof s.type === 'string' && s.type.trim())
            .map((s) => ({ type: s.type.trim(), price: Number(s.price) || 0, userId: user._id }));
          if (payload.length) {
            await Service.deleteMany({ userId: user._id });
            await Service.insertMany(payload);
          }
        }
        if (Array.isArray(dedicationSamples)) {
          const uploaded = [];
          // Map provided files by index via fields dedicationSampleVideo[0], dedicationSampleVideo[1], ...
          const sampleFiles = Array.isArray(req.files) ? req.files : [];
          for (let i = 0; i < dedicationSamples.length; i += 1) {
            const x = dedicationSamples[i];
            if (!x || typeof x.type !== 'string' || !x.type.trim()) continue;
            let videoUrl = typeof x.video === 'string' && x.video.trim() ? x.video.trim() : '';
            if (!videoUrl) {
              const fieldName = `dedicationSampleVideo[${i}]`;
              const fileAtSameIndex = sampleFiles.find((f) => f.fieldname === fieldName);
              if (fileAtSameIndex && fileAtSameIndex.buffer) videoUrl = await uploadVideo(fileAtSameIndex.buffer);
            }
            if (videoUrl) {
              uploaded.push({
                type: x.type.trim(),
                video: videoUrl,
                description: x.description ? x.description.trim() : undefined,
                userId: user._id
              });
            }
          }
          if (uploaded.length) {
            await DedicationSample.deleteMany({ userId: user._id });
            await DedicationSample.insertMany(uploaded);
          }
        }
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid dedications/services payload' });
      }
    }

    const updated = await user.save();
    const updatedUser = await User.findById(updated._id).populate('profession');

    let extra = {};
    if (updatedUser.role === 'star' || updatedUser.role === 'admin') {
      const [dedicationsRes, servicesRes, samplesRes] = await Promise.all([
        Dedication.find({ userId: updatedUser._id }).sort({ createdAt: -1 }),
        Service.find({ userId: updatedUser._id }).sort({ createdAt: -1 }),
        DedicationSample.find({ userId: updatedUser._id }).sort({ createdAt: -1 }),
      ]);
      extra = {
        dedications: dedicationsRes.map((d) => ({ id: d._id, type: d.type, price: d.price, userId: d.userId, createdAt: d.createdAt, updatedAt: d.updatedAt })),
        services: servicesRes.map((s) => ({ id: s._id, type: s.type, price: s.price, userId: s.userId, createdAt: s.createdAt, updatedAt: s.updatedAt })),
        dedicationSamples: samplesRes.map((x) => ({ id: x._id, type: x.type, video: x.video, description: x.description, userId: x.userId, createdAt: x.createdAt, updatedAt: x.updatedAt })),
      };
    }
    return res.json({
      success: true,
      message: 'Profile updated',
      data: {
        ...sanitizeUser(updatedUser),
        ...extra
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }
    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
    if (typeof decoded.sessionVersion !== 'number' || decoded.sessionVersion !== user.sessionVersion) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const accessToken = createAccessToken({ userId: decoded.userId, sessionVersion: user.sessionVersion });
    return res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        tokens: { accessToken }
      }
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

export const checkUser = async (req, res) => {
  try {
    const emailRaw = typeof req.body.email === 'string' ? req.body.email : '';
    const contactRaw = typeof req.body.contact === 'string' ? req.body.contact : '';
    const email = emailRaw.trim();
    const contact = normalizeContact(contactRaw.trim());

    if (!email && !contact) {
      return res.status(400).json({ success: false, message: 'Either email or contact is required' });
    }

    const query = email ? { email: email.toLowerCase() } : { contact };
    const exists = await User.exists(query);
    return res.json({
      success: true,
      message: 'User check completed',
      data: {
        exists: !!exists
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { contact, newPassword } = req.body;
    const normalizedContact = typeof contact === 'string' ? normalizeContact(contact) : contact;
    if (!normalizedContact || !newPassword) {
      return res.status(400).json({ success: false, message: 'Contact and newPassword are required' });
    }
    const user = await User.findOne({ contact: normalizedContact });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    return res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and newPassword are required' });
    }
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    return res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const me = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const user = await User.findById(req.user._id).populate('profession');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    let extra = {};

    if (user.role === 'star' || user.role === 'admin') {
      const [dedicationsRes, servicesRes, dedicationSamples] = await Promise.all([
        Dedication.find({ userId: user._id }).sort({ createdAt: -1 }),
        Service.find({ userId: user._id }).sort({ createdAt: -1 }),
        DedicationSample.find({ userId: user._id }).sort({ createdAt: -1 }),
      ]);
      const allservices = [
        ...dedicationsRes.map(d => ({ id: d._id, type: d.type, price: d.price, userId: d.userId, createdAt: d.createdAt, updatedAt: d.updatedAt, itemType: 'dedication' })),
        ...servicesRes.map(s => ({ id: s._id, type: s.type, price: s.price, userId: s.userId, createdAt: s.createdAt, updatedAt: s.updatedAt, itemType: 'service' }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      extra = {
        allservices,
        dedications: dedicationsRes.map((d) => ({ id: d._id, type: d.type, price: d.price, userId: d.userId, createdAt: d.createdAt, updatedAt: d.updatedAt })),
        services: servicesRes.map((s) => ({ id: s._id, type: s.type, price: s.price, userId: s.userId, createdAt: s.createdAt, updatedAt: s.updatedAt })),
        dedicationSamples: dedicationSamples.map((x) => ({ id: x._id, type: x.type, video: x.video, description: x.description, userId: x.userId, createdAt: x.createdAt, updatedAt: x.updatedAt })),
      };
    }

    if (user.role === 'fan') {
      // Get fan's transactions only
      const transactions = await Transaction.find({ payerId: user._id })
        .populate('receiverId', 'name pseudo profilePic role agoraKey')
        .sort({ createdAt: -1 })
        .limit(20);

      extra = {
        transactions: transactions.map(txn => ({
          id: txn._id,
          type: txn.type,
          receiver: txn.receiverId ? sanitizeUserData(txn.receiverId) : null,
          amount: txn.amount,
          description: txn.description,
          paymentMode: txn.paymentMode,
          status: txn.status,
          metadata: txn.metadata,
          createdAt: txn.createdAt
        })),
        transactionStats: {
          totalTransactions: transactions.length,
          totalSpent: transactions
            .filter(txn => txn.status === 'completed')
            .reduce((sum, txn) => sum + txn.amount, 0)
        }
      };
    }

    return res.json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        ...sanitizeUser(user),
        ...extra
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Soft delete user account (mark as deleted)
export const softDeleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    // Ensure user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // If already soft-deleted, return idempotent response
    if (user.isDeleted) {
      return res.json({ success: true, message: 'Account already marked for deletion', data: { deletedAt: user.deletedAt } });
    }

    // Check for active appointments, dedication requests, and live show attendances
    const [activeAppointments, activeDedicationRequests, activeLiveShowAttendances] = await Promise.all([
      // Check for active appointments (pending or approved)
      Appointment.find({
        $or: [
          { fanId: userId, status: { $in: ['pending', 'approved'] } },
          { starId: userId, status: { $in: ['pending', 'approved'] } }
        ]
      }),
      // Check for active dedication requests (pending or approved)
      DedicationRequest.find({
        $or: [
          { fanId: userId, status: { $in: ['pending', 'approved'] } },
          { starId: userId, status: { $in: ['pending', 'approved'] } }
        ]
      }),
      // Check for active live show attendances (pending or approved)
      LiveShowAttendance.find({
        fanId: userId,
        status: { $in: ['pending', 'approved'] }
      })
    ]);

    // If user has active commitments, prevent deletion
    if (activeAppointments.length > 0 || activeDedicationRequests.length > 0 || activeLiveShowAttendances.length > 0) {
      const pendingItems = [];

      if (activeAppointments.length > 0) {
        pendingItems.push(`${activeAppointments.length} active appointment(s)`);
      }

      if (activeDedicationRequests.length > 0) {
        pendingItems.push(`${activeDedicationRequests.length} active dedication request(s)`);
      }

      if (activeLiveShowAttendances.length > 0) {
        pendingItems.push(`${activeLiveShowAttendances.length} active live show attendance(s)`);
      }

      return res.status(400).json({
        success: false,
        message: `Cannot delete account. You have ${pendingItems.join(' and ')}. Please complete, cancel, or reject them first.`,
        data: {
          activeAppointments: activeAppointments.length,
          activeDedicationRequests: activeDedicationRequests.length,
          activeLiveShowAttendances: activeLiveShowAttendances.length,
          totalPending: activeAppointments.length + activeDedicationRequests.length + activeLiveShowAttendances.length
        }
      });
    }

    // Soft delete the user (mark as deleted)
    const deletedAt = new Date();
    await User.findByIdAndUpdate(userId, {
      isDeleted: true,
      deletedAt
    });

    return res.json({
      success: true,
      message: 'Account marked for deletion successfully',
      data: {
        deletedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Toggle available for bookings status
export const toggleAvailableForBookings = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user._id;
    const { availableForBookings } = req.body;

    // Coerce the value to boolean
    const toBoolean = (value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return ['true', '1', 'yes', 'on'].includes(normalized);
      }
      return Boolean(value);
    };
    const coerced = toBoolean(availableForBookings);

    // Update the user's availableForBookings status
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { availableForBookings: coerced },
      { new: true }
    ).select('-password -passwordResetToken -passwordResetExpires');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      message: `Successfully ${coerced ? 'enabled' : 'disabled'} bookings availability`,
      data: {
        user: sanitizeUser(updatedUser)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Admin function to permanently delete a soft-deleted user
export const permanentlyDeleteUser = async (req, res) => {
  try {
    if (!req.user?._id || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    // Get user to check if they are soft deleted
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.isDeleted) {
      return res.status(400).json({ success: false, message: 'User is not marked for deletion' });
    }

    // Clean up related data
    try {
      // Remove user from other users' favorites
      await User.updateMany(
        { favorites: userId },
        { $pull: { favorites: userId } }
      );

      // If user is a star, clean up star-related data
      if (user.role === 'star') {
        await DedicationRequest.deleteMany({ starId: userId });

        // Delete dedications
        await Dedication.deleteMany({ userId });

        // Delete services
        await Service.deleteMany({ userId });

        // Delete dedication samples
        await DedicationSample.deleteMany({ userId });

        // Delete availabilities
        await Availability.deleteMany({ userId });

        // Cancel/delete appointments where user is the star
        await Appointment.updateMany(
          { starId: userId, status: { $in: ['pending', 'confirmed'] } },
          { status: 'cancelled', cancelledAt: new Date() }
        );
      }

      // If user is a fan, clean up fan-related data
      if (user.role === 'fan') {
        // Delete dedication requests where user is the fan
        await DedicationRequest.deleteMany({ fanId: userId });

        // Cancel/delete appointments where user is the fan
        await Appointment.updateMany(
          { fanId: userId, status: { $in: ['pending', 'confirmed'] } },
          { status: 'cancelled', cancelledAt: new Date() }
        );
      }

      // Delete contact support tickets
      await ContactSupport.deleteMany({ userId });

    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
      // Continue with deletion even if cleanup fails
    }

    // Permanently delete the user
    await User.findByIdAndDelete(userId);

    return res.json({
      success: true,
      message: 'User permanently deleted successfully',
      data: {
        deletedAt: new Date(),
        userId
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Admin function to get all soft-deleted users
export const getSoftDeletedUsers = async (req, res) => {
  try {
    if (!req.user?._id || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const softDeletedUsers = await User.find({ isDeleted: true })
      .select('-password -passwordResetToken -passwordResetExpires')
      .sort({ deletedAt: -1 });

    return res.json({
      success: true,
      message: 'Soft deleted users retrieved successfully',
      data: {
        count: softDeletedUsers.length,
        users: softDeletedUsers
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Update FCM token for push notifications
export const updateFcmToken = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user._id;
    const { fcmToken } = req.body;

    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required and must be a string'
      });
    }

    // Update the user's FCM token
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { fcmToken },
      { new: true }
    ).select('-password -passwordResetToken -passwordResetExpires');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      message: 'FCM token updated successfully',
      data: {
        user: sanitizeUser(updatedUser)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Update APNs token for iOS push notifications
export const updateApnsToken = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user._id;
    const { apnsToken } = req.body;

    if (!apnsToken || typeof apnsToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'APNs token is required and must be a string'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { apnsToken },
      { new: true }
    ).select('-password -passwordResetToken -passwordResetExpires');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      message: 'APNs token updated successfully',
      data: {
        user: sanitizeUser(updatedUser)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Update VoIP token for iOS VoIP push notifications
export const updateVoipToken = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user._id;
    const { voipToken } = req.body;

    if (!voipToken || typeof voipToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'VoIP token is required and must be a string'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { voipToken },
      { new: true }
    ).select('-password -passwordResetToken -passwordResetExpires');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      message: 'VoIP token updated successfully',
      data: {
        user: sanitizeUser(updatedUser)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Update device type for push notifications
export const updateDeviceType = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user._id;
    const { deviceType } = req.body;

    if (!deviceType || !['ios', 'android'].includes(deviceType)) {
      return res.status(400).json({
        success: false,
        message: 'Device type is required and must be either "ios" or "android"'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { deviceType },
      { new: true }
    ).select('-password -passwordResetToken -passwordResetExpires');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      message: 'Device type updated successfully',
      data: {
        user: sanitizeUser(updatedUser)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Update development mode setting
export const updateIsDev = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user._id;
    const { isDev } = req.body;

    if (typeof isDev === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'isDev parameter is required'
      });
    }

    const booleanIsDev = convertToBoolean(isDev);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isDev: booleanIsDev },
      { new: true }
    ).select('-password -passwordResetToken -passwordResetExpires');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      message: 'Development mode updated successfully',
      data: {
        user: sanitizeUser(updatedUser)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Logout user and invalidate all tokens
export const logout = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = req.user._id;

    // Increment session version to invalidate all existing tokens
    const currentSessionVersion = req.user.sessionVersion || 0;
    const newSessionVersion = currentSessionVersion + 1;

    // Clear all push notification tokens and increment session version
    await User.findByIdAndUpdate(userId, {
      $unset: {
        fcmToken: 1,
        apnsToken: 1,
        voipToken: 1
      },
      sessionVersion: newSessionVersion
    });

    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


