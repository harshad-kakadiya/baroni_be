import { validationResult } from 'express-validator';
import User from '../models/User.js';
import mongoose from 'mongoose';

// Add a star to favorites
export const addToFavorites = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { starId } = req.body;
    const fanId = req.user._id;

    // Validate starId
    if (!mongoose.Types.ObjectId.isValid(starId)) {
      return res.status(400).json({ success: false, message: 'Invalid star ID' });
    }

    // Check if user is a fan
    if (req.user.role !== 'fan') {
      return res.status(403).json({ success: false, message: 'Only fans can add favorites' });
    }

    // Check if star exists and is actually a star
    const star = await User.findOne({ _id: starId, role: 'star' });
    if (!star) {
      return res.status(404).json({ success: false, message: 'Star not found' });
    }

    // Check if already in favorites
    const fan = await User.findById(fanId);
    if (fan.favorites.includes(starId)) {
      return res.status(400).json({ success: false, message: 'Star is already in favorites' });
    }

    // Add to favorites
    fan.favorites.push(starId);
    await fan.save();

    return res.json({ 
      success: true, 
      message: 'Star added to favorites',
      data: { starId, added: true }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Remove a star from favorites
export const removeFromFavorites = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { starId } = req.body;
    const fanId = req.user._id;

    // Validate starId
    if (!mongoose.Types.ObjectId.isValid(starId)) {
      return res.status(400).json({ success: false, message: 'Invalid star ID' });
    }

    // Check if user is a fan
    if (req.user.role !== 'fan') {
      return res.status(403).json({ success: false, message: 'Only fans can remove favorites' });
    }

    // Remove from favorites
    const fan = await User.findById(fanId);
    const index = fan.favorites.indexOf(starId);
    
    if (index === -1) {
      return res.status(400).json({ success: false, message: 'Star is not in favorites' });
    }

    fan.favorites.splice(index, 1);
    await fan.save();

    return res.json({ 
      success: true, 
      message: 'Star removed from favorites',
      data: { starId, removed: true }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Toggle favorite status (add if not present, remove if present)
export const toggleFavorite = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { starId } = req.body;
    const fanId = req.user._id;

    // Validate starId
    if (!mongoose.Types.ObjectId.isValid(starId)) {
      return res.status(400).json({ success: false, message: 'Invalid star ID' });
    }

    // Check if user is a fan
    if (req.user.role !== 'fan') {
      return res.status(403).json({ success: false, message: 'Only fans can manage favorites' });
    }

    // Check if star exists and is actually a star
    const star = await User.findOne({ _id: starId, role: 'star' });
    if (!star) {
      return res.status(404).json({ success: false, message: 'Star not found' });
    }

    // Toggle favorite status
    const fan = await User.findById(fanId);
    const isFavorite = fan.favorites.includes(starId);
    
    if (isFavorite) {
      // Remove from favorites
      const index = fan.favorites.indexOf(starId);
      fan.favorites.splice(index, 1);
      await fan.save();
      
      return res.json({ 
        success: true, 
        message: 'Star removed from favorites',
        data: { starId, isFavorite: false, action: 'removed' }
      });
    } else {
      // Add to favorites
      fan.favorites.push(starId);
      await fan.save();
      
      return res.json({ 
        success: true, 
        message: 'Star added to favorites',
        data: { starId, isFavorite: true, action: 'added' }
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get user's favorites list
export const getFavorites = async (req, res) => {
  try {
    const fanId = req.user._id;

    // Check if user is a fan
    if (req.user.role !== 'fan') {
      return res.status(403).json({ success: false, message: 'Only fans can view favorites' });
    }

    // Get user with populated favorites
    const fan = await User.findById(fanId).populate({
      path: 'favorites',
      select: '-password -passwordResetToken -passwordResetExpires',
      match: { role: 'star' } // Only include actual stars
    });

    if (!fan) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ 
      success: true, 
      data: fan.favorites,
      count: fan.favorites.length
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
