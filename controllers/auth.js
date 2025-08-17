import bcrypt from 'bcryptjs';
import {validationResult} from 'express-validator';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Dedication from '../models/Dedication.js';
import Service from '../models/Service.js';
import DedicationSample from '../models/DedicationSample.js';
import {createAccessToken, createRefreshToken, verifyRefreshToken} from '../utils/token.js';
import {uploadFile} from '../utils/uploadFile.js';
import {uploadVideo} from '../utils/uploadFile.js';

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
  role: user.role,
});

export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { contact, email, password } = req.body;

    // Check if we have either contact or email
    if (!contact && !email) {
      return res.status(400).json({
        success: false,
        message: 'Either contact number or email is required'
      });
    }

    // If email is provided, password is required
    if (contact && !password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required when registering with contact'
      });
    }

    const normalizedEmail = email ? email.toLowerCase() : undefined;
    const orQueries = [];
    if (normalizedEmail) orQueries.push({ email: normalizedEmail });
    if (contact) orQueries.push({ contact });

    const existing = orQueries.length ? await User.findOne({ $or: orQueries }) : null;
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email or contact already in use'
      });
    }

    // Hash password only if provided, otherwise set to null
    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const user = await User.create({
      contact,
      email: normalizedEmail,
      password: hashedPassword
    });

    // Auto-login
    const accessToken = createAccessToken({ userId: user._id });
    const refreshToken = createRefreshToken({ userId: user._id });

    return res.status(201).json({
      success: true,
      message: 'Registered successfully',
      data: sanitizeUser(user),
      tokens: { accessToken, refreshToken }
    });
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

    const { contact, email, isMobile } = req.body;
    let user;
    if (isMobile) {
      if (!contact) return res.status(400).json({ success: false, message: 'Contact is required for mobile login' });
      if (contact && !req.body.password) {
        return res.status(400).json({
          success: false,
          message: 'Password is required when login with contact'
        });
      }
      user = await User.findOne({ contact });
    } else {
      if (!email) return res.status(400).json({ success: false, message: 'Email is required for email login' });
      user = await User.findOne({ email: email.toLowerCase() });
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (!user.password && user.contact) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

   if(req.body.password) {
     const ok = await bcrypt.compare(req.body.password, user.password);
     if (!ok) {
       return res.status(401).json({ success: false, message: 'Invalid credentials' });
     }
   }

    const accessToken = createAccessToken({ userId: user._id });
    const refreshToken = createRefreshToken({ userId: user._id });
    return res.json({ success: true, data: sanitizeUser(user), tokens: { accessToken, refreshToken } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const completeProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { name, pseudo, preferredLanguage, country, email, contact, about, location, profession, profilePic } = req.body;
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

    if (profilePic) {
      user.profilePic = profilePic;
    } else if (req.file && req.file.buffer) {
      user.profilePic = await uploadFile(req.file.buffer);
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
              uploaded.push({ type: x.type.trim(), video: videoUrl, userId: user._id });
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
        dedicationSamples: samplesRes.map((x) => ({ id: x._id, type: x.type, video: x.video, userId: x.userId, createdAt: x.createdAt, updatedAt: x.updatedAt })),
      };
    }

    return res.json({ success: true, message: 'Profile updated', data: { ...sanitizeUser(updatedUser), ...extra } });
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

export const checkUser = async (req, res) => {
  try {
    const emailRaw = typeof req.body.email === 'string' ? req.body.email : '';
    const contactRaw = typeof req.body.contact === 'string' ? req.body.contact : '';
    const email = emailRaw.trim();
    const contact = contactRaw.trim();

    if (!email && !contact) {
      return res.status(400).json({ success: false, message: 'Either email or contact is required' });
    }

    const query = email ? { email: email.toLowerCase() } : { contact };
    const exists = await User.exists(query);
    return res.json({ success: true, exists: !!exists });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { contact, newPassword } = req.body;
    if (!contact || !newPassword) {
      return res.status(400).json({ success: false, message: 'Contact and newPassword are required' });
    }
    const user = await User.findOne({ contact });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
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
    let extra = {};
    if (user.role === 'star' || user.role === 'admin') {
      const [dedications, services, dedicationSamples] = await Promise.all([
        Dedication.find({ userId: user._id }).sort({ createdAt: -1 }),
        Service.find({ userId: user._id }).sort({ createdAt: -1 }),
        DedicationSample.find({ userId: user._id }).sort({ createdAt: -1 }),
      ]);
      extra = {
        dedications: dedications.map((d) => ({ id: d._id, type: d.type, price: d.price, userId: d.userId, createdAt: d.createdAt, updatedAt: d.updatedAt })),
        services: services.map((s) => ({ id: s._id, type: s.type, price: s.price, userId: s.userId, createdAt: s.createdAt, updatedAt: s.updatedAt })),
        dedicationSamples: dedicationSamples.map((x) => ({ id: x._id, type: x.type, video: x.video, userId: x.userId, createdAt: x.createdAt, updatedAt: x.updatedAt })),
      };
    }
    return res.json({ success: true, data: { ...sanitizeUser(user), ...extra } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

