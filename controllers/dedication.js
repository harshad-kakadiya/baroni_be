import { validationResult } from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import Dedication from '../models/Dedication.js';

const sanitize = (doc) => ({ id: doc._id, type: doc.type, price: doc.price, userId: doc.userId, createdAt: doc.createdAt, updatedAt: doc.updatedAt });

export const createDedication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { type, price } = req.body;
    const created = await Dedication.create({ type: type.trim(), price, userId: req.user._id });
    return res.status(201).json({ success: true, data: sanitize(created) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyDedications = async (req, res) => {
  try {
    const items = await Dedication.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, data: items.map(sanitize) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getDedication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const item = await Dedication.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: sanitize(item) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateDedication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { type, price } = req.body;
    const item = await Dedication.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    if (type) item.type = type.trim();
    if (price !== undefined) item.price = price;
    const updated = await item.save();
    return res.json({ success: true, data: sanitize(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteDedication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const deleted = await Dedication.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!deleted) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


















