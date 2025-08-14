import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {validationResult} from 'express-validator';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Dedication from '../models/Dedication.js';
import Service from '../models/Service.js';
import {createAccessToken, createRefreshToken, verifyRefreshToken} from '../utils/token.js';
import {sendResetEmail} from '../services/emailService.js';
import {sendOtpSms} from '../services/smsService.js';
import {uploadFile} from '../utils/uploadFile.js';

const sanitizeUser = (user) => ({
  id: user._id,
  contact: user.contact,
  email: user.email,
  name: user.name,
  pseudo: user.pseudo,
  profilePic: user.profilePic,
  preferredLanguage: user.preferredLanguage,
  country: user.country,
  about: user.about,
  location: user.location,
  profession: user.profession,
  userType: user.userType,
});

export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contact, email, password } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { contact }] });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email or contact already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const otp = '1234';
    const expires = new Date(Date.now() + 100000 * 60 * 1000);

    const user = await User.create({ contact, email, password: hashed, otpCode: otp, otpExpires: expires });
    await sendOtpSms(contact, otp);

    return res.status(201).json({ success: true, message: 'Registered. OTP sent to contact for verification', data: { id: user._id } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contact, password } = req.body;
    const user = await User.findOne({ contact });
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isContactVerified) {
      return res.status(403).json({ success: false, message: 'Contact not verified' });
    }

    const accessToken = createAccessToken({ userId: user._id });
    const refreshToken = createRefreshToken({ userId: user._id });
    return res.json({ success: true, data: sanitizeUser(user), tokens: { accessToken, refreshToken } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: 'userId and otp are required' });
    }
    const user = await User.findById(userId);

    if (!user || !user.otpCode || !user.otpExpires) {
      return res.status(400).json({ success: false, message: 'OTP not found' });
    }
    if (user.otpCode !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }
    user.isContactVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    const accessToken = createAccessToken({ userId: user._id });
    const refreshToken = createRefreshToken({ userId: user._id });
    return res.json({ success: true, message: 'Contact verified', data: sanitizeUser(user), tokens: { accessToken, refreshToken } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const completeProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { name, pseudo, preferredLanguage, country, email, contact, about, location, profession, dedications, services } = req.body;

    if (!user.isContactVerified) return res.status(403).json({ success: false, message: 'Contact not verified' });

    if (pseudo) {
      const exists = await User.exists({ _id: { $ne: user._id }, pseudo });
      if (exists) return res.status(409).json({ success: false, message: 'Pseudo already in use' });
    }

    if (email) user.email = email.toLowerCase();
    if (contact) user.contact = contact;
    if (name) user.name = name;
    if (pseudo) user.pseudo = pseudo;
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
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

    if (req.file && req.file.buffer) {
      user.profilePic = await uploadFile(req.file.buffer);
    }

    // Allow non-fan users to optionally initialize dedications and services in complete profile
    if (user.userType !== 'fan') {
      try {
        if (Array.isArray(dedications)) {
          // each item: { type, price }
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
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid dedications/services payload' });
      }
    }

    const updated = await user.save();
    return res.json({ success: true, message: 'Profile updated', data: sanitizeUser(updated) });
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
    const accessToken = createAccessToken({ userId: decoded.userId });
    return res.json({ success: true, tokens: { accessToken } });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // do not reveal existence
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    user.passwordResetToken = token;
    user.passwordResetExpires = expires;
    await user.save();

    await sendResetEmail(user.email, token);
    return res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
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
    return res.json({ success: true, message: 'Password updated successfully' });
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
    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

