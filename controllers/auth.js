import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { validationResult } from 'express-validator';
import User from '../models/User.js';
import { createAccessToken, createRefreshToken, verifyRefreshToken } from '../utils/token.js';
import { sendResetEmail } from '../services/emailService.js';

const sanitizeUser = (user) => ({
  id: user._id,
  contact: user.contact,
  email: user.email,
  name: user.name,
  pseudo: user.pseudo,
  profilePic: user.profilePic,
  preferredLanguage: user.preferredLanguage,
  country: user.country,
});

export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contact, email, password, name, pseudo, profilePic, preferredLanguage, country } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { contact }, { pseudo }] });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email, contact or pseudo already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = await User.create({
      contact,
      email,
      password: hashed,
      name,
      pseudo,
      profilePic,
      preferredLanguage,
      country,
    });

    const accessToken = createAccessToken({ userId: user._id });
    const refreshToken = createRefreshToken({ userId: user._id });

    return res.status(201).json({ success: true, data: sanitizeUser(user), tokens: { accessToken, refreshToken } });
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

    const { identifier, password } = req.body; // email or contact
    const user = await User.findOne({ $or: [{ email: identifier?.toLowerCase() }, { contact: identifier }] });
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const accessToken = createAccessToken({ userId: user._id });
    const refreshToken = createRefreshToken({ userId: user._id });
    return res.json({ success: true, data: sanitizeUser(user), tokens: { accessToken, refreshToken } });
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


