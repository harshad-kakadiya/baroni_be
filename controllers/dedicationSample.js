import { validationResult } from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import DedicationSample from '../models/DedicationSample.js';
import { uploadVideo } from '../utils/uploadFile.js';

const sanitize = (doc) => ({ id: doc._id, type: doc.type, video: doc.video, description: doc.description, userId: doc.userId, createdAt: doc.createdAt, updatedAt: doc.updatedAt });

export const createDedicationSample = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { type, description } = req.body;
    let { video } = req.body;
    if (!video) {
      if (!req.file || !req.file.buffer) return res.status(400).json({ success: false, message: 'Video is required' });
      video = await uploadVideo(req.file.buffer);
    }
    const created = await DedicationSample.create({ 
      type: type.trim(), 
      video: String(video).trim(), 
      description: description ? description.trim() : undefined,
      userId: req.user._id 
    });
    return res.status(201).json({ success: true, data: sanitize(created) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyDedicationSamples = async (req, res) => {
  try {
    const items = await DedicationSample.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ 
      success: true, 
      message: 'Dedication samples retrieved successfully',
      data: {
        dedicationSamples: items.map(sanitize)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getDedicationSample = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const item = await DedicationSample.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ 
      success: true, 
      message: 'Dedication sample retrieved successfully',
      data: {
        dedicationSample: sanitize(item)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateDedicationSample = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { type, description } = req.body;
    let { video } = req.body;
    const item = await DedicationSample.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    if (type) item.type = type.trim();
    if (description !== undefined) item.description = description ? description.trim() : undefined;
    if (video) {
      item.video = String(video).trim();
    } else if (req.file && req.file.buffer) {
      item.video = await uploadVideo(req.file.buffer);
    }
    const updated = await item.save();
    return res.json({ 
      success: true, 
      message: 'Dedication sample updated successfully',
      data: {
        dedicationSample: sanitize(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteDedicationSample = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const deleted = await DedicationSample.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!deleted) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ 
      success: true, 
      message: 'Dedication sample deleted successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


